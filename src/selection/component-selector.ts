// 节点选择器：生成内联到产物 HTML 的交互脚本（点击返回节点信息 + 高亮）
// 零依赖 vanilla JS，产物仍是单文件静态 HTML；fgui 标识已替换为 egret

/** 产物 HTML 内联的选择器脚本 */
export function selectorScript(): string {
  return `
(function () {
  var info = document.getElementById("egret-info");
  var selected = null;

  function clearSelection() {
    if (selected) {
      selected.classList.remove("egret-selected");
      selected = null;
    }
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest(".egret-node") : null;
    clearSelection();
    if (!el) {
      if (info) info.textContent = "点击画布中的节点查看定位信息";
      return;
    }
    el.classList.add("egret-selected");
    selected = el;
    var data = {
      id: el.dataset.egretId,
      name: el.dataset.egretName,
      type: el.dataset.egretType,
      path: el.dataset.egretPath,
      key: el.dataset.egretKey,
      source: el.dataset.egretSrc
    };
    if (info) info.textContent = "选中: " + JSON.stringify(data);
    console.log("[egret-select]", data);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      clearSelection();
      if (info) info.textContent = "已取消选择";
    }
  });

  // 深度定位：/view?file=X&focus=<stableKey>，加载即高亮目标节点并滚动到可视区
  var focusKey = new URLSearchParams(location.search).get("focus");
  if (focusKey) {
    var el = document.querySelector('[data-egret-key="' + focusKey + '"]');
    if (el) {
      el.classList.add("egret-selected");
      selected = el;
      el.scrollIntoView({ block: "center" });
      var fd = {
        id: el.dataset.egretId,
        name: el.dataset.egretName,
        type: el.dataset.egretType,
        path: el.dataset.egretPath,
        key: el.dataset.egretKey,
        source: el.dataset.egretSrc
      };
      if (info) info.textContent = "定位: " + JSON.stringify(fd);
      console.log("[egret-focus]", fd);
    } else if (info) {
      info.textContent = "未找到 focus 节点: " + focusKey;
    }
  }
})();
`;
}
