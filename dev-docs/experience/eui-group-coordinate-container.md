# EUI Group 是坐标系容器，不渲染定位容器导致子节点全部堆叠原点

## 问题现象

真实工程 ActionSelectSkin.exml 渲染时，视觉验收发现所有按钮堆叠在画布左上角，
水平分布完全丢失（按钮在 EXML 里的 x 分别是 208/381/571/741/925）。

## 排查过程

用 DOM 遍历打印每个 `.egret-node` 的 `getBoundingClientRect()`：
按钮节点自身的 left/top 数值正确，但父级链上没有任何定位盒，坐标全部相对 stage 原点。

## 根因

初版渲染器沿袭 FairyGUI 项目「group 不产生 DOM」的约定（FairyGUI 的 GGroup 是无视觉引用分组，
成员坐标相对组件原点）。但 **EUI 的 e:Group 是真实坐标系容器**：子节点的 x/y 相对组的原点，
组自身的 x/y/alpha/rotation/visible 都影响子树。组不渲染定位容器 = 整个组内坐标系坍缩到 stage 原点。

## 解决方案

1. `group-node.ts` 渲染为定位容器 div（`left/top` 来自组自身 bounds，子节点嵌套其中），
   EUI 组嵌套坐标逐级生效。
2. 同步修正布局层的两个配套问题：
   - **无显式尺寸容器的首选尺寸测量**（`measurePreferred`）：Egret measuredSize 语义，
     显式尺寸 > 图片自然尺寸 > 子节点包围盒，用于 Button/Skin 等参与父级百分比与居中求解；
   - **内联 Skin 是透明包装层**：子节点布局参数使用外层容器尺寸，不使用 Skin 自身空 bounds。

## 预防/注意事项

1. 迁移渲染约定时先确认两个引擎的同类组件语义是否真的相同——FairyGUI GGroup 和 EUI e:Group
   名字相似，机制完全不同。
2. 布局类问题的验证必须用 DOM 实测坐标，视觉截图的"堆叠"观感可能被占位框等元素干扰误判。
3. EXML 里 `visible="false"` 的节点（如 ActionSelectSkin 的碰/杠/过按钮默认隐藏）不参与视觉验收，
   不要误判为"没渲染出来"。
