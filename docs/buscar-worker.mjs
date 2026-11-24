import {createSearch} from './busqueda.mjs';
let engine;
self.onmessage=async({data})=>{
  try {
    if(data.type==='init') {engine=createSearch(data.corpus);self.postMessage({ready:true});return;}
    if(data.type==='words') self.postMessage({id:data.id,result:engine.words(data.query,data.options)});
  } catch(e){self.postMessage({id:data.id,error:e.message});}
};
