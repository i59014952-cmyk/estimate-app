// docExport.js — выгрузка сметы в разных форматах.
//   DOC  — Word-совместимый HTML (открывается в Word/LibreOffice).
//   PDF  — печать готового макета в отдельном окне (── «Сохранить как PDF»).
//   DOCX — настоящий OOXML-документ, упакованный мини-ZIP'ом (без внешних
//          зависимостей), открывается в Word, Google Docs, LibreOffice.

(function () {
  // ---- DOC: тот же HTML, что и для печати, но как загружаемый .doc ----
  function downloadDoc(html, filename) {
    const blob = new Blob(['﻿', html], { type: 'application/msword;charset=utf-8' });
    triggerDownload(blob, filename);
  }

  // ---- PDF: открыть макет в новом окне и вызвать печать ----
  function printPdf(html, title) {
    const w = window.open('', '_blank');
    if (!w) { alert('Разрешите всплывающие окна, чтобы сохранить PDF.'); return; }
    const printHtml = html.replace(
      '</head>',
      '<style>@page{margin:14mm} @media print{body{background:#fff!important} .page{box-shadow:none!important}}</style></head>'
    );
    w.document.open();
    w.document.write(printHtml);
    w.document.close();
    w.focus();
    const go = () => { try { w.print(); } catch (_) {} };
    if (w.document.readyState === 'complete') setTimeout(go, 350);
    else w.onload = () => setTimeout(go, 350);
  }

  // ---- DOCX ----
  function downloadDocx(data, filename) {
    const files = [
      { name: '[Content_Types].xml', data: enc(CONTENT_TYPES) },
      { name: '_rels/.rels', data: enc(RELS) },
      { name: 'word/document.xml', data: enc(buildDocumentXml(data)) },
    ];
    const zip = zipStore(files);
    triggerDownload(new Blob([zip], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }), filename);
  }

  const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>';

  const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>';

  const xmlEsc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ruNum = (n) => (n == null ? '—' : Math.round(Number(n) || 0).toLocaleString('ru-RU'));
  const ruQty = (n) => Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const money = (n) => (n == null ? '—' : ruNum(n) + ' ₽');

  function para(text, opt) {
    opt = opt || {};
    const rpr = (opt.bold ? '<w:b/>' : '')
      + (opt.size ? '<w:sz w:val="' + opt.size + '"/>' : '')
      + (opt.color ? '<w:color w:val="' + opt.color + '"/>' : '')
      + (opt.caps ? '<w:caps/>' : '')
      + (opt.spacing ? '<w:spacing w:val="' + opt.spacing + '"/>' : '');
    const jc = opt.align ? '<w:jc w:val="' + opt.align + '"/>' : '';
    const after = '<w:spacing w:after="' + (opt.after != null ? opt.after : 120) + '"/>';
    const ppr = '<w:pPr>' + after + jc + '</w:pPr>';
    const run = '<w:r><w:rPr>' + rpr + '</w:rPr><w:t xml:space="preserve">' + xmlEsc(text) + '</w:t></w:r>';
    return '<w:p>' + ppr + (text === '' ? '' : run) + '</w:p>';
  }

  function cell(text, opt) {
    opt = opt || {};
    const tcPr = '<w:tcPr>'
      + (opt.w ? '<w:tcW w:w="' + opt.w + '" w:type="dxa"/>' : '')
      + (opt.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + opt.shade + '"/>' : '')
      + '<w:vAlign w:val="center"/>'
      + '</w:tcPr>';
    const p = para(text, { bold: opt.bold, size: opt.size, color: opt.color, align: opt.align, after: 0 });
    return '<w:tc>' + tcPr + p + '</w:tc>';
  }

  function buildDocumentXml(d) {
    const W = { idx: 850, name: 4400, price: 1400, qty: 1400, total: 1588 };
    const border = '<w:tblBorders>'
      + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) {
        return '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="D9CDB6"/>';
      }).join('') + '</w:tblBorders>';

    const headRow = '<w:tr>'
      + cell('№', { w: W.idx, shade: '1F1A15', color: 'F3EAD8', bold: true, size: 18, align: 'center' })
      + cell('Название работ', { w: W.name, shade: '1F1A15', color: 'F3EAD8', bold: true, size: 18 })
      + cell('Цена, ₽', { w: W.price, shade: '1F1A15', color: 'F3EAD8', bold: true, size: 18, align: 'center' })
      + cell('Кол-во', { w: W.qty, shade: '1F1A15', color: 'F3EAD8', bold: true, size: 18, align: 'center' })
      + cell('Итого, ₽', { w: W.total, shade: '1F1A15', color: 'F3EAD8', bold: true, size: 18, align: 'center' })
      + '</w:tr>';

    const dataRows = (d.rows || []).map(function (r) {
      const qtyText = ruQty(r.qty) + (r.unit ? ' ' + r.unit : '');
      return '<w:tr>'
        + cell(String(r.idx).padStart(2, '0'), { w: W.idx, color: '8A7F73', align: 'center', size: 22 })
        + cell(r.name, { w: W.name, color: '1F1A15', size: 22 })
        + cell(money(r.price), { w: W.price, align: 'center', size: 22 })
        + cell(qtyText, { w: W.qty, align: 'center', size: 22 })
        + cell(money(r.total), { w: W.total, align: 'center', size: 22, bold: true })
        + '</w:tr>';
    }).join('');

    const totalRow = '<w:tr>'
      + cell('', { w: W.idx, shade: 'EFE7D7' })
      + cell('Итого по объекту', { w: W.name, shade: 'EFE7D7', bold: true, size: 22 })
      + cell('', { w: W.price, shade: 'EFE7D7' })
      + cell('', { w: W.qty, shade: 'EFE7D7' })
      + cell(money(d.grand), { w: W.total, shade: 'EFE7D7', bold: true, color: '7A5A36', size: 26, align: 'center' })
      + '</w:tr>';

    const table = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' + border + '</w:tblPr>'
      + headRow + dataRows + totalRow + '</w:tbl>';

    const metaBits = ['Коммерческое предложение', d.code ? '№ ' + d.code : '', d.date || ''].filter(Boolean).join('  ·  ');
    const titleText = d.construction ? d.construction + ' — проект «' + d.title + '»' : 'Смета «' + (d.title || '') + '»';
    const recipBits = [d.location, d.areaText, d.estimator ? 'менеджер ' + d.estimator : ''].filter(Boolean).join('  ·  ');

    const head = []
      .concat(para(metaBits, { caps: true, color: '5B524A', size: 16, spacing: 32, align: 'center' }))
      .concat(para(titleText, { bold: true, size: 56, color: '1F1A15', align: 'center', after: 200 }))
      .concat(recipBits ? para('Подготовлено для ' + recipBits, { color: '5B524A', size: 26, align: 'center', after: 240 }) : '')
      .concat(para('Ориентировочная смета', { caps: true, bold: true, color: '7A5A36', size: 20, spacing: 56, align: 'center' }))
      .join('');

    const foot = []
      .concat(para('', { after: 200 }))
      .concat(para('С уважением,', { color: '5B524A', size: 22, after: 40 }))
      .concat(para(d.estimator || 'Менеджер проекта', { bold: true, size: 28, after: 40 }))
      .concat(para('KUB HOUSE · +7 (495) 128-41-11 · info@kub.team', { color: '5B524A', size: 22 }))
      .concat(para('Действительно до ' + (d.validUntil || ''), { caps: true, color: '5B524A', size: 18, spacing: 36 }))
      .join('');

    const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
      + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:body>' + head + table + foot + sect + '</w:body></w:document>';
  }

  // ---- общие утилиты ----
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
  }

  function enc(str) { return new TextEncoder().encode(str); }

  // CRC32 (для ZIP)
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Минимальный ZIP без сжатия (store) — достаточно для OOXML-пакета.
  function zipStore(files) {
    const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
    const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    const enc2 = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const nameBytes = enc2.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0)
      );
      const localHeader = new Uint8Array(local.length + nameBytes.length);
      localHeader.set(local, 0); localHeader.set(nameBytes, local.length);
      chunks.push(localHeader, data);
      const cen = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
      );
      const cenRec = new Uint8Array(cen.length + nameBytes.length);
      cenRec.set(cen, 0); cenRec.set(nameBytes, cen.length);
      central.push(cenRec);
      offset += localHeader.length + data.length;
    }
    const centralStart = offset;
    let centralSize = 0;
    for (const c of central) { chunks.push(c); centralSize += c.length; }
    const end = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(centralSize), u32(centralStart), u16(0)
    ));
    chunks.push(end);
    let total = 0; for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
    return out;
  }

  window.KHDocExport = { downloadDoc, printPdf, downloadDocx };
})();
