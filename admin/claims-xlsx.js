/* Minimal dependency-free XLSX writer. Strings remain strings, including leading '='. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClaimsXlsx=api;})(globalThis,function(){
 'use strict';
 const enc=new TextEncoder(),xml=x=>String(x??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 function col(i){let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;}
 function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
 function header(size,values){const a=new Uint8Array(size),v=new DataView(a.buffer);for(const [offset,width,n] of values)width===4?v.setUint32(offset,n,true):v.setUint16(offset,n,true);return a;}
 function join(arr){const b=new Uint8Array(arr.reduce((n,a)=>n+a.length,0));let i=0;for(const a of arr){b.set(a,i);i+=a.length;}return b;}
 function zip(files){
  const local=[],central=[];let offset=0;
  for(const [path,text] of Object.entries(files)){
   const name=enc.encode(path),body=enc.encode(text),sum=crc(body);
   const h=header(30,[[0,4,0x04034b50],[4,2,20],[6,2,0x800],[14,4,sum],[18,4,body.length],[22,4,body.length],[26,2,name.length]]);
   local.push(h,name,body);
   central.push(header(46,[[0,4,0x02014b50],[4,2,20],[6,2,20],[8,2,0x800],[16,4,sum],[20,4,body.length],[24,4,body.length],[28,2,name.length],[42,4,offset]]),name);
   offset+=h.length+name.length+body.length;
  }
  const cd=join(central),n=Object.keys(files).length;
  return join([...local,cd,header(22,[[0,4,0x06054b50],[8,2,n],[10,2,n],[12,4,cd.length],[16,4,offset]])]);
 }
 function build(sheets){
  const files={};
  files['[Content_Types].xml']=`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  files['_rels/.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  files['xl/workbook.xml']=`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name.slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels']=`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`;
  sheets.forEach((s,i)=>{files[`xl/worksheets/sheet${i+1}.xml`]=`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${s.rows.map((row,r)=>`<row r="${r+1}">${row.map((v,c)=>typeof v==='number'&&Number.isFinite(v)?`<c r="${col(c)}${r+1}"><v>${v}</v></c>`:`<c r="${col(c)}${r+1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;});
  return zip(files);
 }
 function download(sheets,filename){const url=URL.createObjectURL(new Blob([build(sheets)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 return {build,download};
});
