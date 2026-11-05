// 工作区前端页面（零构建 vanilla，服务端内嵌返回）
// 两级导航：EXML 目录树 -> 文件；渲染在 iframe 中（复用 /view 的选择器与高亮）

export const indexHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Egret EXML 工作区 - egret-exml-html-renderer</title>
<style>
* { box-sizing: border-box; }
body { margin:0; font-family:sans-serif; background:#222; color:#ddd; display:flex; height:100vh; }
#side { width:300px; min-width:300px; background:#2b2b2b; border-right:1px solid #444; overflow:auto; padding:10px; }
#side h1 { font-size:14px; color:#8ee6ff; margin:4px 0 10px; }
#files button { display:block; width:100%; text-align:left; background:transparent; color:#bbb; border:none; border-bottom:1px solid #333; padding:4px 6px; cursor:pointer; font-size:12px; }
#files button:hover, #files button.active { color:#ffd666; background:#2f2f2f; }
#main { flex:1; display:flex; flex-direction:column; }
#crumb { padding:6px 12px; font-size:12px; color:#999; background:#2b2b2b; border-bottom:1px solid #444; }
#frame { flex:1; border:none; background:#1e1e1e; }
</style>
</head>
<body>
<div id="side">
  <h1>Egret EXML 工作区</h1>
  <div id="files">加载中...</div>
</div>
<div id="main">
  <div id="crumb">选择左侧 EXML 文件查看渲染结果</div>
  <iframe id="frame"></iframe>
</div>
<script>
var crumb = document.getElementById("crumb");
var frame = document.getElementById("frame");
var filesEl = document.getElementById("files");

fetch("/api/exml").then(function (r) { return r.json(); }).then(function (data) {
  filesEl.innerHTML = "";
  data.files.forEach(function (f) {
    var b = document.createElement("button");
    b.textContent = f.file;
    b.onclick = function () {
      filesEl.querySelectorAll("button").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      crumb.textContent = "加载中: " + f.file;
      frame.src = "/view?file=" + encodeURIComponent(f.file);
      crumb.textContent = "EXML: " + f.file;
    };
    filesEl.appendChild(b);
  });
});
</script>
</body>
</html>
`;
