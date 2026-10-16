import {test} from 'node:test';
import assert from 'node:assert/strict';
import {riepiloga} from '../dati.mjs';
test('pagamenti misti e monetaria in centesimi',()=>{const x=riepiloga([null,{a:{id:'a',CONTANTI:0.1,POS:0.2,ARTICOLI:[]}},{b:{id:'b',tipo:'USCITA',importo:0.1}}]);assert.equal(x.totale,0.2);assert.equal(x.scontrini,1)});
test('deduplica live e storico',()=>{const x=riepiloga([{abc:{id:'abc',contanti:20}},{abc:{id:'abc',CONTANTI:10,ARTICOLI:[{CODICE:'A',DESCRIZIONE:'Crema',IMPORTO:10,QUANTITA:1}]}},null]);assert.equal(x.totale,10);assert.equal(x.prodotti.get('Crema'),1)});
test('non conta bonus e resi nei prodotti e distingue codici uguali descrizioni',()=>{const x=riepiloga([null,{a:{CONTANTI:90,ARTICOLI:[{CODICE:'A',DESCRIZIONE:'Profumo',IMPORTO:50,QUANTITA:1},{CODICE:'B',DESCRIZIONE:'Profumo',IMPORTO:50,QUANTITA:1},{CODICE:'BNS123',CATEGORIA:'VOUCHER',IMPORTO:-10,QUANTITA:1},{CODICE:'RES-A',CATEGORIA:'RESO',IMPORTO:-10,QUANTITA:1}] }},null]);assert.equal(x.prodotti.get('Profumo (A)'),1);assert.equal(x.prodotti.get('Profumo (B)'),1);assert.equal(x.bonusUtilizzati,10)});
test('operatore separa saldo e vendita',()=>{const x=riepiloga([null,{a:{OPERATORE:'Anna',CONTANTI:100}},{b:{operatore:'Anna',tipo:'USCITA',importo:20}}]);assert.equal(x.operatori.get('Anna').totale,80);assert.equal(x.operatori.get('Anna').vendite,100)});
