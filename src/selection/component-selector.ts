// 节点选择器：生成内联到产物 HTML 的交互脚本（点击选中 + 高亮 + postMessage 双向同步）
// 零依赖 vanilla JS，产物仍是单文件静态 HTML
//
// 两种运行形态：
//   独立打开 /view（window.parent === window）：仅本地信息条 + focus 定位（P2-C 行为不变）
//   工作台 iframe（?docid= 存在）：额外走 postMessage 协议（P3-A P1 执行计划 3.2）
//     点击 -> NODE_SELECTED（documentId + key）；点空白 -> NODE_DESELECTED
//     父发 SELECT_NODE/DESELECT_NODE -> 本地高亮/取消；找不到 -> NODE_NOT_FOUND
// 点击判定统一 closest("[data-egret-key]")：覆盖 .egret-stage 根节点与 .egret-skin-wrap 包装层
// （.egret-skin-wrap 不是 .egret-node，位图数字位无 data 属性 -> 命中外层节点本体）

export function selectorScript(): string {
  return `
(function () {
  var info = document.getElementById("egret-info");
  var selected = null;
  var docId = new URLSearchParams(location.search).get("docid") || "";
  var hasParent = !!(window.parent && window.parent !== window);

  function postToParent(m) {
    if (!hasParent) return;
    m.documentId = docId;
    window.parent.postMessage(m, location.origin);
  }
  function infoOf(el) {
    return {
      id: el.dataset.egretId,
      name: el.dataset.egretName,
      type: el.dataset.egretType,
      path: el.dataset.egretPath,
      key: el.dataset.egretKey,
      source: el.dataset.egretSrc
    };
  }
  function applySelection(el) {
    if (selected) selected.classList.remove("egret-selected");
    selected = el;
    el.classList.add("egret-selected");
    if (el === hovered) clearHover(); // 选中（金框）优先，清除 hover 蓝框
  }
  function clearSelection(notify) {
    if (selected) {
      selected.classList.remove("egret-selected");
      selected = null;
    }
    if (notify) postToParent({ type: "NODE_DESELECTED" });
  }

  // key 查元素：key 可含任意字符，不拼属性选择器，遍历比较 dataset
  function findByKey(key) {
    var els = document.querySelectorAll("[data-egret-key]");
    for (var i = 0; i < els.length; i++) {
      if (els[i].dataset.egretKey === key) return els[i];
    }
    return null;
  }

  // 点击：统一 closest("[data-egret-key]")（含舞台根与皮肤包装层）；点空白取消选择
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-egret-key]") : null;
    if (!el) {
      clearSelection(true);
      if (info) info.textContent = "点击画布中的节点查看定位信息";
      return;
    }
    applySelection(el);
    var data = infoOf(el);
    if (info) info.textContent = "选中: " + JSON.stringify(data);
    console.log("[egret-select]", data);
    postToParent({ type: "NODE_SELECTED", key: data.key, id: data.id, name: data.name, nodeType: data.type });
  });

  // 悬停提示（P3-C）：蓝框临时提示 + iframe 内 Tooltip（名称/类型/渲染尺寸）；
  // 不触发 Selection Store、不改 Inspector；选中节点（金框）不再量示 hover，两状态视觉区分
  var hovered = null;
  var tip = document.createElement("div");
  tip.className = "egret-tooltip";
  tip.style.display = "none";
  document.body.appendChild(tip);
  function clearHover() {
    if (hovered) { hovered.classList.remove("egret-hover"); hovered = null; }
    tip.style.display = "none";
  }
  document.addEventListener("mouseover", function (e) {
    var el = e.target.closest ? e.target.closest("[data-egret-key]") : null;
    if (!el || el === hovered) { if (!el) clearHover(); return; }
    clearHover();
    if (el.classList.contains("egret-selected")) return; // 已选中（金框）不再量示 hover
    hovered = el;
    el.classList.add("egret-hover");
    var id = el.dataset.egretId || el.dataset.egretName || "";
    var label = (el.dataset.egretType || "?") + (id ? " " + id : "");
    tip.textContent = label + "  " + (el.offsetWidth || 0) + " x " + (el.offsetHeight || 0) + "（渲染尺寸）";
    tip.style.display = "block";
    tip.style.left = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 4) + "px";
    tip.style.top = Math.min(e.clientY + 14, window.innerHeight - tip.offsetHeight - 4) + "px";
  });
  document.addEventListener("mouseout", function (e) {
    if (!hovered) return;
    var to = e.relatedTarget;
    if (to && to.closest && to.closest("[data-egret-key]") === hovered) return; // 节点内移动
    clearHover();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      clearSelection(true);
      if (info) info.textContent = "已取消选择";
    }
  });

  // 父 -> 画布：SELECT_NODE / DESELECT_NODE（校验链 origin -> source(parent) -> documentId -> key 类型）
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin) return;
    if (!hasParent || e.source !== window.parent) return;
    var m = e.data;
    if (!m || typeof m !== "object" || m.documentId !== docId) return; // 过期文档消息丢弃
    if (m.type === "SELECT_NODE") {
      if (typeof m.key !== "string" || !m.key) return;
      var el = findByKey(m.key);
      if (!el) {
        // 树选中了画布未渲染的节点（如 List 动态项）：回报而非静默
        postToParent({ type: "NODE_NOT_FOUND", key: m.key });
        if (info) info.textContent = "未找到选中节点: " + m.key;
        return;
      }
      applySelection(el);
      el.scrollIntoView({ block: "nearest" });
      if (info) info.textContent = "定位: " + JSON.stringify(infoOf(el));
      return;
    }
    if (m.type === "DESELECT_NODE") {
      clearSelection(false);
      if (info) info.textContent = "点击画布中的节点查看定位信息";
    }
  });

  // 画布就绪：通知父（父侧据此补发已选中节点的高亮）
  postToParent({ type: "CANVAS_READY" });

  // 深度定位：/view?file=X&focus=<stableKey>，加载即高亮目标节点并滚动到可视区（兼容保留）
  var focusKey = new URLSearchParams(location.search).get("focus");
  if (focusKey) {
    var el = findByKey(focusKey);
    if (el) {
      applySelection(el);
      el.scrollIntoView({ block: "center" });
      if (info) info.textContent = "定位: " + JSON.stringify(infoOf(el));
      console.log("[egret-focus]", infoOf(el));
    } else if (info) {
      info.textContent = "未找到 focus 节点: " + focusKey;
    }
  }
})();
`;
}
