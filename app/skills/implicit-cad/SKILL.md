---
name: implicit-cad
description: 使用 GLSL 有符号距离场（SDF）在浏览器中创建隐式 CAD 模型，支持光线步进渲染与实时预览。
---

# 隐式 CAD

## 概述

使用此技能进行基于 GLSL 有符号距离场（SDF）的隐式 CAD 建模。与传统边界表示（B-rep）CAD 不同，隐式 CAD 通过描述空间中任意点到表面的距离的数学函数来定义几何体。这种方法能够在浏览器中创建复杂的有机形状、程序化几何体以及实时光线步进渲染。

## 核心规则

1. 将定义 SDF 场景的 GLSL 源码视为唯一事实来源。生成的输出（PNG 截图、GLB 网格）均为派生产物。
2. 仅生成明确的 SDF 预览目标。
3. 查看器提供实时 SDF 预览。使用查看器进行迭代开发。
4. 在编写复杂 SDF 之前，规划 CSG（构造实体几何）树：并集、交集、差集和光滑混合。
5. 使用提供的库中的标准 SDF 图元（球体、立方体、圆柱体、环面等）和变换（平移、旋转、缩放）。
6. 在组合复杂场景之前，先在查看器中逐步测试每个 SDF 操作。
7. 针对实时渲染进行优化：尽可能避免在主距离函数中执行开销较大的操作。

## 必需工作流

1. 规划隐式几何体：确定要创建的形状或场景，以及要使用的 CSG 操作。
2. 编写或修改 GLSL SDF 源码。
3. 使用 SDF 预览模式在查看器中预览。
4. 迭代：根据视觉反馈优化 SDF。
5. 设计完成后，导出为 GLB 网格或保存 SDF 源码。

## 工具与路径

查看器支持 SDF 预览。将 GLSL SDF 代码写入 .glsl 或 .sdf 文件，并在查看器中加载。

基本 SDF 结构示例：

float scene(vec3 p) {
    float sphere = sdSphere(p, 1.0);
    float box = sdBox(p - vec3(2, 0, 0), vec3(1));
    return opUnion(sphere, box);
}

python scripts/export path/to/scene.glsl -o output.glb

## 渐进式参考文档

- references/sdf-primitives.md - 可用的 SDF 图元与操作
- references/csg-operations.md - CSG 操作参考
- references/rendering.md - 渲染与优化指南