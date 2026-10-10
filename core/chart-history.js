/* Shared display ranges over real canonical observations. Never creates bars,
 * adjusts prices or certifies analytical inputs. */
(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.VUCore=root.VUCore||{};root.VUCore.ChartHistory=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';var days={'1M':31,'3M':92,'6M':183,'1Y':366,'3Y':1096,'5Y':1827,'10Y':3653,'MAX':null};
 function available(points,range){if(!Array.isArray(points)||points.length<5||!(range in days))return false;if(range==='MAX')return true;var span=(Date.parse(points[points.length-1][0])-Date.parse(points[0][0]))/86400000;return span>=days[range]*0.95;}
 function slice(points,range){if(!points.length)return {points:[],from:null,to:null,complete:false};var to=points[points.length-1][0],cutoff=days[range]===null?-Infinity:Date.parse(to)-days[range]*86400000,result=points.filter(function(p){return Date.parse(p[0])>=cutoff;});return {points:result,from:result.length?result[0][0]:null,to:to,complete:available(points,range)};}
 function comparable(segments,from,to){return !Array.isArray(segments)||segments.filter(function(s){return s.some(function(p){return p[0]>=from&&p[0]<=to;});}).length<=1;}
 return {days:days,available:available,sliceRange:slice,performanceComparable:comparable};
});
