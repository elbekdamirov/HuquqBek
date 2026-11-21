import {spawnSync} from 'node:child_process';
import {mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const folder=fileURLToPath(new URL('../.local/',import.meta.url));
const file=fileURLToPath(new URL('../.local/providers.dpapi',import.meta.url));
const quoted=file.replaceAll("'","''");
export function saveSecrets(values){
 if(process.platform!=='win32')return;
 mkdirSync(folder,{recursive:true});
 const script=`Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Text.Encoding]::UTF8.GetBytes($v); $e=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [IO.File]::WriteAllBytes('${quoted}',$e)`;
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:JSON.stringify(values),windowsHide:true,encoding:'utf8'});
 if(r.status!==0)throw Error('Encrypted local credential storage failed.');
}
export function loadSecrets(){
 if(process.platform!=='win32'||!existsSync(file))return{};
 const script=`Add-Type -AssemblyName System.Security; $b=[IO.File]::ReadAllBytes('${quoted}'); $d=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($d))`;
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,encoding:'utf8'});
 try{return r.status===0?JSON.parse(r.stdout):{};}catch{return{};}
}
