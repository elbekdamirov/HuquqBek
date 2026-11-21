import { Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import manifest from '../public/assets/manifest.json';
import { Courtroom, Model, Plaques } from './Scene';
import type { Role } from './types';
type V3=[number,number,number];
const meta=(id:string)=>manifest.characters.find(c=>c.id===id)!;
function View({view}:{view:string}){
 const {camera,gl}=useThree();
 useEffect(()=>{camera.position.set(...(view==='judge'?[0,2.2,-4]:view==='party'?[-.5,2,1]:[6.6,4.6,5.7]) as V3);gl.domElement.setAttribute('aria-label','HuquqBek 3D sud zali');},[camera,gl,view]);
 useFrame(()=>camera.updateProjectionMatrix());return null;
}
export default function CourtView({role,avatar,criminal,view='room',talking=false,onFailure}:{role:Role;avatar:string;criminal:boolean;view?:string;talking?:boolean;onFailure:()=>void}){
 const cast=[{asset:role==='sudya'?avatar:'sudya',station:'sudya',seated:true,role:'sudya'},
 {asset:role==='advokat'?avatar:'advokat',station:'advokat',seated:false,role:'advokat'},
 {asset:role==='fuqaro'?avatar:'davogar',station:'davogar',seated:true,role:'fuqaro'},
 ...(criminal?[{asset:role==='prokuror'?avatar:'prokuror',station:'prokuror',seated:true,role:'prokuror'}]:[]),
 {asset:'javobgar',station:'javobgar',seated:true,role:'respondent'},
 {asset:'kotib',station:'kotib',seated:true,role:'clerk'}];
 return <Canvas dpr={[1,1.25]} camera={{position:[6.6,4.6,5.7],fov:51,near:.1,far:60}} gl={{antialias:true,toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1.2}} onCreated={({gl})=>{gl.setClearColor('#c8c5ba');gl.domElement.addEventListener('webglcontextlost',onFailure,{once:true});}}>
  <hemisphereLight args={['#fff5e8','#5d584b',1.7]}/><ambientLight intensity={.4}/><directionalLight position={[7,8,2]} color="#fff1d9" intensity={2.3}/><pointLight position={[0,4,-4]} intensity={65} distance={18}/>
  <Suspense fallback={null}><Courtroom quality="low" onWalk={()=>{}}/>
  {cast.map(actor=><group key={actor.role} position={meta(actor.station).spawn.position as V3} rotation={[0,meta(actor.station).spawn.yaw_rad,0]}><Model asset={meta(actor.asset)} seated={actor.seated} talking={talking&&actor.role!==role} reduced={false} quality="low"/></group>)}
  <Plaques criminal={criminal}/></Suspense>
  <View view={view}/><OrbitControls key={view} target={view==='judge'?[0,1.5,-7.5]:[-.5,1,-4]} minDistance={2} maxDistance={17} maxPolarAngle={Math.PI*.48} enablePan={false}/>
 </Canvas>;
}
