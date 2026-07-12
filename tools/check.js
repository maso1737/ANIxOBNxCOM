#!/usr/bin/env node
// 依存ゼロのスモークチェック: node tools/check.js
// 1) <script> の構文チェック（new Function）
// 2) 配線チェック: JSが参照する #id が HTML に実在するか
// 3) id 重複チェック
// 4) 未参照関数（デッドコード候補）
// 終了コード: 問題があれば 1
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const FILES = ['animator.html', 'oban-builder.html', 'composer.html', 'index.html'];

// type属性を持たない <script> だけを対象にする（id付きJSは拾い、
// type="application/json" 等のデータブロック＝EXPORT WEBのビューアテンプレ等は除外）。
// matchAll と replace で別インスタンスが要るため都度生成する。
const scriptRe = () => /<script(?![^>]*\btype\s*=)[^>]*>([\s\S]*?)<\/script>/g;

// JS内で動的に生成される等、実在チェックから除外するidプレフィックス
const ID_IGNORE = [
  /^kf-/, /^fx-/, /^dot-/, /^tl-wa-/, /^i-/, // composerのプロパティ別・動的id
];

let failures = 0;
const fail = msg => { failures++; console.log('  ✗ ' + msg); };
const ok = msg => console.log('  ✓ ' + msg);

for(const file of FILES){
  console.log('== ' + file + ' ==');
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const jsBlocks = [...html.matchAll(scriptRe())].map(m => m[1]).filter(s => s.length > 200);
  const js = jsBlocks.join('\n;\n');

  // 1) 構文
  try{ new Function(js); ok('構文 OK'); }
  catch(e){ fail('構文エラー: ' + e.message); continue; }

  if(!js) { console.log(); continue; }

  // HTML部（scriptの中身を除いたもの）から id を収集
  const htmlOnly = html.replace(scriptRe(), '');
  const htmlIds = new Set([...htmlOnly.matchAll(/\bid\s*=\s*"([^"]+)"/g)].map(m => m[1]));
  // <script> タグ自身のid（例: id="satsuei-core"）も実在idとして登録
  //（JS本文除去でタグごと消えるが、自分自身をidで参照するのは正当なため）
  for(const m of html.matchAll(/<script[^>]*\bid\s*=\s*["']([^"']+)["']/g)) htmlIds.add(m[1]);

  // 2) 配線: getElementById('x') / $('#x') / querySelector('#x')
  const refs = new Set();
  for(const m of js.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)) refs.add(m[1]);
  for(const m of js.matchAll(/\$\(\s*['"]#([\w-]+)['"]\s*\)/g)) refs.add(m[1]);
  for(const m of js.matchAll(/querySelector(?:All)?\(\s*['"]#([\w-]+)['"]\s*\)/g)) refs.add(m[1]);
  let wireBad = 0;
  for(const id of refs){
    if(htmlIds.has(id)) continue;
    if(ID_IGNORE.some(re => re.test(id))) continue;
    // JS内で動的生成される要素（createElement後に id 代入 or innerHTML内）は許容
    if(new RegExp(`\\bid\\s*=\\s*['"\`]${id}['"\`]|\\.id\\s*=\\s*['"\`]${id}['"\`]`).test(js)) continue;
    fail(`JSが参照する #${id} がHTMLに存在しません`);
    wireBad++;
  }
  if(!wireBad) ok(`配線 OK（参照id ${refs.size}件すべて解決）`);

  // 3) id 重複
  const counts = {};
  for(const m of htmlOnly.matchAll(/\bid\s*=\s*"([^"]+)"/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
  const dups = Object.entries(counts).filter(([, n]) => n > 1);
  if(dups.length) dups.forEach(([id, n]) => fail(`id="${id}" が ${n}回 重複定義`));
  else ok('id重複なし');

  // 4) 未参照関数（複数宣言 let a,b 対応の宣言収集つき・簡易）
  const defs = [];
  js.split('\n').forEach((l, i) => {
    const m = l.match(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if(m) defs.push({ name: m[1], line: i + 1 });
  });
  const dead = [];
  for(const d of defs){
    const re = new RegExp('\\b' + d.name.replace(/\$/g, '\\$') + '\\b', 'g');
    if((html.match(re) || []).length <= 1) dead.push(d.name);
  }
  if(dead.length) dead.forEach(n => fail(`未参照関数（デッドコード候補）: ${n}`));
  else ok('未参照関数なし');

  console.log();
}

if(failures){ console.log(`NG: ${failures}件の問題`); process.exit(1); }
console.log('ALL PASS');
