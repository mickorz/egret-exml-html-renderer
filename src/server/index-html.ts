// 工作台前端页面（零构建 vanilla，服务端内嵌返回）
// 三块能力（P2-C）：
//   1. 资产搜索：文件模糊 / 类名精确 / 组件类型 三模式（/api/ui-assets）
//   2. 点击预览：搜索结果与文件列表点击 -> iframe /view 渲染
//   3. 关系定位：预览文件 -> 拉取其根类邻域（/api/component-graph?class=），uses/usedBy 一键跳转

export const indexHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Egret EXML 工作台 - egret-exml-html-renderer</title>
<style>
* { box-sizing: border-box; }
body { margin:0; font-family:sans-serif; background:#222; color:#ddd; display:flex; height:100vh; }
#side { width:320px; min-width:320px; background:#2b2b2b; border-right:1px solid #444; overflow:auto; padding:10px; }
#side h1 { font-size:14px; color:#8ee6ff; margin:4px 0 10px; }
#searchbar { margin-bottom:10px; }
#searchbar input { width:100%; padding:5px 7px; background:#1e1e1e; color:#ddd; border:1px solid #555; border-radius:3px; font-size:12px; }
#modes { margin:6px 0; }
#modes button { background:#333; color:#999; border:1px solid #555; border-radius:3px 0 0 3px; padding:3px 10px; font-size:12px; cursor:pointer; }
#modes button + button { border-radius:0; }
#modes button:last-child { border-radius:0 3px 3px 0; }
#modes button.active { background:#4a6a8a; color:#fff; }
#searchbar .row { margin-top:6px; }
#searchbar .row button { background:#4a6a8a; color:#fff; border:none; border-radius:3px; padding:4px 12px; font-size:12px; cursor:pointer; }
#searchbar .row button.ghost { background:transparent; color:#999; border:1px solid #555; }
#listinfo { font-size:11px; color:#888; margin:4px 0 6px; }
#files button.item { display:block; width:100%; text-align:left; background:transparent; color:#bbb; border:none; border-bottom:1px solid #333; padding:5px 6px; cursor:pointer; font-size:12px; }
#files button.item:hover, #files button.item.active { color:#ffd666; background:#2f2f2f; }
#files button.item .cls { color:#7ec6ff; font-size:11px; margin-left:4px; }
#files button.item .meta { color:#777; font-size:10px; margin-left:6px; }
#main { flex:1; display:flex; flex-direction:column; min-width:0; }
#crumb { padding:6px 12px; font-size:12px; color:#999; background:#2b2b2b; border-bottom:1px solid #444; white-space:nowrap; overflow-x:auto; }
#frame { flex:1; border:none; background:#1e1e1e; }
#nb { display:none; padding:8px 12px; font-size:12px; background:#262626; border-bottom:1px solid #444; }
#nb .title { color:#8ee6ff; margin-bottom:4px; }
#nb .group { margin:4px 0; }
#nb .label { color:#888; display:inline-block; width:64px; }
#nb a.chip { display:inline-block; background:#333; color:#ffd666; border:1px solid #555; border-radius:3px; padding:2px 8px; margin:2px 4px 2px 0; cursor:pointer; text-decoration:none; font-size:11px; }
#nb a.chip small { color:#888; }
#nb .cycle { color:#ff9d66; margin-top:4px; }
#nb .none { color:#666; }
</style>
</head>
<body>
<div id="side">
  <h1>Egret EXML 工作台</h1>
  <div id="searchbar">
    <input id="q" placeholder="搜索：文件路径 / 皮肤类名 / 组件类型" />
    <div id="modes">
      <button data-mode="file" class="active">文件模糊</button><button data-mode="class">类名精确</button><button data-mode="component">组件类型</button>
    </div>
    <div class="row">
      <button id="go">搜索</button> <button id="reset" class="ghost">返回全量</button>
    </div>
  </div>
  <div id="listinfo"></div>
  <div id="files">加载中...</div>
</div>
<div id="main">
  <div id="crumb">选择左侧 EXML 文件查看渲染结果</div>
  <div id="nb"></div>
  <iframe id="frame"></iframe>
</div>
<script>
var crumb = document.getElementById("crumb");
var frame = document.getElementById("frame");
var filesEl = document.getElementById("files");
var listinfo = document.getElementById("listinfo");
var nbEl = document.getElementById("nb");
var qEl = document.getElementById("q");
var mode = "file";

// 模式切换
document.getElementById("modes").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-mode]");
  if (!b) return;
  mode = b.dataset.mode;
  document.querySelectorAll("#modes button").forEach(function (x) { x.classList.remove("active"); });
  b.classList.add("active");
  if (qEl.value) doSearch();
});

function itemButton(file, cls, meta) {
  var b = document.createElement("button");
  b.className = "item";
  b.innerHTML = escapeHtml(file) + (cls ? ' <span class="cls">' + escapeHtml(cls) + '</span>' : "") +
    (meta ? ' <span class="meta">' + escapeHtml(meta) + '</span>' : "");
  b.onclick = function () {
    filesEl.querySelectorAll("button.item").forEach(function (x) { x.classList.remove("active"); });
    b.classList.add("active");
    openFile(file);
  };
  return b;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 打开文件：iframe 预览 + 拉根类邻域
function openFile(file) {
  crumb.textContent = "EXML: " + file;
  frame.src = "/view?file=" + encodeURIComponent(file);
  nbEl.style.display = "none";
  fetch("/api/scene?file=" + encodeURIComponent(file)).then(function (r) { return r.ok ? r.json() : null; }).then(function (scene) {
    if (!scene || !scene.className) { nbEl.style.display = "block"; nbEl.innerHTML = '<div class="title">组件关系</div><span class="none">根元素无 class，无关系可查</span>'; return; }
    loadNeighborhood(scene.className, file);
  }).catch(function () { nbEl.style.display = "none"; });
}

// 邻域面板：uses / usedBy 芯片，点击跳转定义文件或引用文件
function loadNeighborhood(cls, fromFile) {
  nbEl.style.display = "block";
  nbEl.innerHTML = '<div class="title">组件关系：' + escapeHtml(cls) + ' 加载中...</div>';
  fetch("/api/component-graph?class=" + encodeURIComponent(cls)).then(function (r) { return r.json(); }).then(function (nb) {
    var html = '<div class="title">组件关系：' + escapeHtml(cls) + (nb.node && nb.node.file ? ' <span class="none">(' + escapeHtml(nb.node.file) + ')</span>' : "") + '</div>';
    html += '<div class="group"><span class="label">引用了</span>' + (nb.uses.length ? nb.uses.map(function (e) { return chip(e.to, e.kind, "定义"); }).join("") : '<span class="none">无</span>') + '</div>';
    html += '<div class="group"><span class="label">被引用</span>' + (nb.usedBy.length ? nb.usedBy.map(function (e) { return chip(e.from, e.kind, "文件"); }).join("") : '<span class="none">无（孤儿皮肤或代码挂载）</span>') + '</div>';
    if (nb.inCycle) html += '<div class="cycle">警告：该类在图级引用环中 [' + nb.inCycle.map(escapeHtml).join(", ") + ']</div>';
    nbEl.innerHTML = html;
    nbEl.querySelectorAll("a[data-file]").forEach(function (a) {
      a.onclick = function (ev) {
        ev.preventDefault();
        openFile(a.dataset.file);
      };
    });
  });
  function chip(cls2, kind, jump) {
    // 跳转目标：拉邻域拿定义文件（引用类名点击 -> 跳该类定义文件；被引用方 -> 跳引用文件）
    return '<a class="chip" data-cls="' + escapeHtml(cls2) + '" data-kind="' + kind + '" data-jump="' + jump + '" href="#">' + escapeHtml(cls2) + ' <small>' + kind + "·" + jump + '</small></a>';
  }
}

// 邻域芯片点击：引用类名 -> 定位该类定义文件并跳转
nbEl.addEventListener("click", function (e) {
  var a = e.target.closest("a[data-cls]");
  if (!a || a.dataset.jump !== "定义") return;
  e.preventDefault();
  var cls = a.dataset.cls;
  crumb.textContent = "定位类定义: " + cls;
  fetch("/api/ui-assets?class=" + encodeURIComponent(cls)).then(function (r) { return r.json(); }).then(function (res) {
    if (res.count > 0) { openFile(res.entries[0].basic.file); }
    else { crumb.textContent = "类 " + cls + " 无定义文件（悬空引用）"; }
  });
});

// 搜索：三模式 -> /api/ui-assets
function doSearch() {
  var v = qEl.value.trim();
  if (!v) return;
  listinfo.textContent = "搜索中...";
  var param = mode === "file" ? "file" : mode === "class" ? "class" : "component";
  fetch("/api/ui-assets?" + param + "=" + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (res) {
    filesEl.innerHTML = "";
    listinfo.textContent = "命中 " + res.count + " / " + res.stats.entryCount + "（" + Math.round(res.stats.buildMs) + "ms，失败 " + res.stats.failureCount + "）";
    res.entries.forEach(function (en) {
      filesEl.appendChild(itemButton(en.basic.file, en.basic.rootClass, en.basic.width + "x" + en.basic.height + " · " + en.basic.nodeCount + "节点"));
    });
  });
}
document.getElementById("go").onclick = doSearch;
qEl.addEventListener("keydown", function (e) { if (e.key === "Enter") doSearch(); });

// 返回全量文件列表
function loadAll() {
  filesEl.innerHTML = "加载中...";
  fetch("/api/exml").then(function (r) { return r.json(); }).then(function (data) {
    filesEl.innerHTML = "";
    listinfo.textContent = "全部 " + data.files.length + " 个 EXML";
    data.files.forEach(function (f) { filesEl.appendChild(itemButton(f.file)); });
  });
}
document.getElementById("reset").onclick = function () { qEl.value = ""; loadAll(); };

loadAll();
</script>
</body>
</html>
`;
