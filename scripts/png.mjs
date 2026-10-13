import fs from 'node:fs'; import zlib from 'node:zlib';
export function decode(file){
  const b=fs.readFileSync(file); let p=8; let ihdr,idat=[],plte=null,trns=null;
  while(p<b.length){const len=b.readUInt32BE(p),type=b.toString('ascii',p+4,p+8),d=b.subarray(p+8,p+8+len);
    if(type==='IHDR')ihdr={w:d.readUInt32BE(0),h:d.readUInt32BE(4),depth:d[8],ct:d[9],interlace:d[12]};
    if(type==='IDAT')idat.push(d); if(type==='PLTE')plte=d; if(type==='tRNS')trns=d; p+=12+len;}
  const raw=zlib.inflateSync(Buffer.concat(idat)); const ch={0:1,2:3,3:1,4:2,6:4}[ihdr.ct]; const bpp=Math.max(1,ch*ihdr.depth/8); const stride=Math.ceil(ihdr.w*ch*ihdr.depth/8);
  const out=Buffer.alloc(stride*ihdr.h); let prev=Buffer.alloc(stride);
  for(let y=0;y<ihdr.h;y++){const f=raw[y*(stride+1)],line=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)),cur=out.subarray(y*stride,(y+1)*stride);
    for(let i=0;i<stride;i++){const a=i>=bpp?cur[i-bpp]:0,up=prev[i],c=i>=bpp?prev[i-bpp]:0;let v=line[i];
      if(f===1)v+=a;else if(f===2)v+=up;else if(f===3)v+=(a+up)>>1;else if(f===4){const pa=Math.abs(up-c),pb=Math.abs(a-c),pc=Math.abs(a+up-2*c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?up:c)}cur[i]=v&255}
    prev=cur}
  return {ihdr,out,ch,stride,plte,trns};
}
