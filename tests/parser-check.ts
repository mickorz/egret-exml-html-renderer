import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseExmlText } from "../src/parser/exml/exml-parser.js";
import { normalizeExmlText } from "../src/parser/exml/exml-normalizer.js";
import { splitStateAttr, egretColorToCss, numList } from "../src/parser/exml/exml-attributes.js";

// Parser 测试（P0-G / G1）：Namespace / 根节点 / 嵌套 / 属性保留 / state 属性 / 非法 XML / 未知节点

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, "fixtures", "egret");

// ---- Namespace 与根节点 ----
{
  const doc = parseExmlText(
    `<e:Skin class="T" width="10" xmlns:e="http://ns.egret.com/eui" xmlns:w="http://ns.egret.com/wing"><e:Group/></e:Skin>`,
  );
  assert.equal(doc.root.localName, "Skin");
  assert.equal(doc.root.prefix, "e");
  assert.equal(doc.namespace.e, "http://ns.egret.com/eui");
  assert.equal(doc.namespace.w, "http://ns.egret.com/wing");
  assert.equal(doc.root.children.length, 1);
  assert.equal(doc.diagnostics.length, 0);
}

// ---- 属性保留（含特殊字符与原始大小写） ----
{
  const doc = parseExmlText(
    `<e:Skin xmlns:e="http://ns.egret.com/eui"><e:Label text="a&lt;b" textColor="0xFF8800" x="1.5"/></e:Skin>`,
  );
  const label = doc.root.children[0];
  assert.equal(label.attributes.text, "a<b");
  assert.equal(label.attributes.textColor, "0xFF8800");
  assert.equal(label.attributes.x, "1.5");
}

// ---- 非法 XML：明确报错 ----
{
  assert.throws(
    () => parseExmlText(`<e:Skin xmlns:e="http://ns.egret.com/eui"><e:Label></e:Skin>`),
    /EXML 解析失败/,
  );
}

// ---- 多根节点：明确报错 ----
{
  assert.throws(
    () => parseExmlText(`<e:Skin xmlns:e="http://ns.egret.com/eui"/><e:Skin xmlns:e="http://ns.egret.com/eui"/>`),
    /应有且仅有一个根节点/,
  );
}

// ---- 归一化：wing 元数据剔除 / custom 归类 / skinName 提升 ----
{
  const { root, diagnostics } = normalizeExmlText(
    `<e:Skin class="T" xmlns:e="http://ns.egret.com/eui" xmlns:w="http://ns.egret.com/wing" xmlns:ns1="*">
       <w:Config id="c1"/>
       <e:Group id="g"><e:Label id="l"/></e:Group>
       <ns1:Widget id="cw"/>
     </e:Skin>`,
  );
  assert.equal(root.kind, "eui");
  assert.equal(root.className, "eui.Skin");
  // w:Config 被剔除，只剩 Group 与 custom
  assert.equal(root.children.length, 2);
  assert.equal(root.children[0].className, "eui.Group");
  assert.equal(root.children[1].kind, "custom");
  assert.equal(diagnostics.length, 0);
}

{
  // skinName 内联皮肤：包装层剔除，Skin 子节点提升
  const { root } = normalizeExmlText(
    `<e:Skin xmlns:e="http://ns.egret.com/eui">
       <e:Button id="btn"><e:skinName><e:Skin states="up"><e:Image source="a"/></e:Skin></e:skinName></e:Button>
     </e:Skin>`,
  );
  const btn = root.children[0];
  assert.equal(btn.className, "eui.Button");
  assert.equal(btn.children.length, 1);
  assert.equal(btn.children[0].className, "eui.Skin");
  assert.equal(btn.children[0].children[0].className, "eui.Image");
}

// ---- state 后缀属性拆分 ----
{
  const node = parseExmlText(
    `<e:Skin xmlns:e="http://ns.egret.com/eui"><e:Image x="1" visible.down="false" y.state_up="5"/></e:Skin>`,
  ).root.children[0];
  const plain = splitStateAttr("visible.down");
  assert.deepEqual(plain, ["visible", "down"]);
  const { root } = normalizeExmlText(
    `<e:Skin xmlns:e="http://ns.egret.com/eui"><e:Image x="1" visible.down="false"/></e:Skin>`,
  );
  const img = root.children[0];
  assert.equal(img.attrs.x, "1");
  assert.equal(img.attrs.visible, undefined);
  assert.equal(img.states.down.visible, "false");
}

// ---- includeIn 记录 ----
{
  const { root } = normalizeExmlText(
    `<e:Skin xmlns:e="http://ns.egret.com/eui"><e:Rect includeIn="s1,s2"/></e:Skin>`,
  );
  assert.equal(root.children[0].includeIn, "s1,s2");
}

// ---- 属性工具 ----
assert.deepEqual(numList("10,10,20,20", 4), [10, 10, 20, 20]);
assert.equal(numList("1,2", 4), null);
assert.equal(egretColorToCss("0xFF8800"), "#ff8800");
assert.equal(egretColorToCss("#00FF00"), "#00ff00");
assert.equal(egretColorToCss("0x11223344"), "rgba(17,34,51,0.267)");
assert.equal(egretColorToCss("red"), null);

// ---- Namespace 作用域（P0.1 加固）：非 e 前缀的 EUI 组件 / 局部重定义 / 默认 namespace ----
{
  // 非标准前缀（ui:）指向 EUI namespace：组件与 skinName 都按 URI 识别
  const { root } = normalizeExmlText(
    `<e:Skin xmlns:ui="http://ns.egret.com/eui">
       <ui:Button id="b"><ui:skinName><ui:Skin states="up"><ui:Label/></ui:Skin></ui:skinName></ui:Button>
     </e:Skin>`,
  );
  const btn = root.children[0];
  assert.equal(btn.className, "eui.Button");
  assert.equal(btn.children[0].className, "eui.Skin");
}
{
  // 局部重定义：子节点声明覆盖祖先同名前缀
  const { root } = normalizeExmlText(
    `<e:Skin xmlns:e="http://ns.egret.com/eui" xmlns:x="http://ns.egret.com/eui">
       <e:Group><x:Image/></e:Group>
     </e:Skin>`,
  );
  assert.equal(root.children[0].children[0].className, "eui.Image");
}
{
  // 默认 namespace（无前缀标签）
  const { root } = normalizeExmlText(
    `<Skin xmlns="http://ns.egret.com/eui"><Label/></Skin>`,
  );
  assert.equal(root.className, "eui.Skin");
  assert.equal(root.children[0].className, "eui.Label");
}

// ---- P1-A：e:layout 属性元素收纳 / custom 节点 nsUri ----
{
  // e:layout 属性元素：从 children 剔除，收纳到 layout 字段（P1-C 应用）
  const { root } = normalizeExmlText(
    `<e:Skin xmlns:e="http://ns.egret.com/eui"><e:List><e:layout><e:HorizontalLayout gap="5"/></e:layout></e:List></e:Skin>`,
  );
  const list = root.children[0];
  assert.equal(list.children.length, 0, "layout 属性元素不应留在 children");
  assert.ok(list.layout, "layout 声明应收纳到 layout 字段");
  assert.equal(list.layout.className, "eui.HorizontalLayout");
  assert.equal(list.layout.attrs.gap, "5");
}
{
  // custom 节点 nsUri（身份解析依据：URI+localName，不依赖前缀）
  const { root } = normalizeExmlText(
    `<e:Skin xmlns:e="http://ns.egret.com/eui" xmlns:g="gdmj.*"><g:ArtNumber/></e:Skin>`,
  );
  assert.equal(root.children[0].nsUri, "gdmj.*");
}

// ---- 真实 fixture 文件解析 ----
{
  // 通过完整构建链路验证 fixture 可解析（buildSceneFromFile 在 render-check 覆盖，这里只验证解析层）
  const doc = parseExmlText(await import("node:fs").then((fs) => fs.readFileSync(path.join(fixtureRoot, "resource/eui_skins/SampleSkin.exml"), "utf8")));
  assert.equal(doc.root.localName, "Skin");
  assert.ok(doc.root.attributes.class === "SampleSkin");
}

console.log("[parser-check] 全部通过");
