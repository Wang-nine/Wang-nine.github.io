---
title: "06 batch MSE：共享参数的贡献汇总"
published: 2026-10-30
description: "按样本配对汇总共享参数的导数贡献，区分 batch MSE、差商、点导数与变化量，并检查归约和数组形状。"
image: ''
tags: ["LLM", "NumPy", "数学基础", "MSE", "导数"]
category: "LLM 学习"
draft: false
lang: zh_CN
slug: "llm-math-numpy-06"
---

> M2.4 主，结合 M2.1 数组与 reduction。简短复习提纲，不是掌握证明。

## 1. 每条链相乘，多条贡献按 loss 定义归约

```text
 x_i、y_i 固定，所有样本共用 w，b=0
w → p_i → r_i → ℓ_i → 平均 → L
```

$$
\begin{aligned}
p_i &= wx_i, \qquad r_i = p_i-y_i, \qquad \ell_i = r_i^2 \\
L &= \frac{1}{N}\sum_{i=1}^{N}\ell_i \\
\frac{d\ell_i}{dw} &= 2r_i x_i \\
\frac{dL}{dw} &= \frac{1}{N}\sum_{i=1}^{N}2r_i x_i
\end{aligned}
$$

先保留样本配对，再平均；通常：

$$
\frac{1}{N}\sum_{i=1}^{N}r_i x_i \ne
\left(\frac{1}{N}\sum_{i=1}^{N}r_i\right)
\left(\frac{1}{N}\sum_{i=1}^{N}x_i\right)
$$

平均系数只使用一次。batch loss 下降不保证每个样本都改善；方向判断只对当前位置足够小的步长成立。

## 2. loss、差商、导数、变化量

| 量 | 意义 |
| --- | --- |
| `L(w)`：batch MSE（均方误差） | 当前残差平方的平均，描述误差大小；不是残差方差 |
| `Q_h` | 区间平均变化率，`h != 0` |
| `L'(w)` | 当前点的瞬时变化率；可导时是差商趋近的极限 |
| `ΔL` | 实际变化量，保留符号 |
| `L'(w)*h` | 对变化量的局部近似；新值约为旧值加此项 |

$$
\begin{aligned}
Q_h &= \frac{L(w+h)-L(w)}{h}, \qquad h \ne 0 \\
\Delta L &= L(w+h)-L(w) \approx L'(w)h \\
L(w+h) &\approx L(w)+L'(w)h
\end{aligned}
$$

同一批固定样本、同一个基准与非零 h 下：各样本的 loss 差商先平均，等于 batch MSE 的差商。有限差商一般不等于点导数；数值计算也不能盲目令 h 任意小。

## 3. 一个数值检查

```text
x = [[1], [2], [3]]，y = [[4], [1], [1]]，w=1
```

每样本平方误差为 9、1、4；每样本导数贡献为 -6、4、12：

$$
L = \frac{9+1+4}{3} = \frac{14}{3}, \qquad
L' = \frac{-6+4+12}{3} = \frac{10}{3}
$$

三样本的平均系数是 `1/3`，不能把旧平均导数直接和新贡献相加。

## 4. shape 与实现检查

- 列向量约定：`x、y、p、r` 与归约前的平方误差 / 导数贡献为 `(N,1)`；batch loss 与导数为标量 `()`。
- 循环内只用当前 `x_i、y_i`；数组版保留 elementwise 配对。
- `calc_loss` 返回 loss，外层才负责相减除以 h。
- 标清解析导数在哪一点计算；从 w 出发的差商用来核对 w 处导数，而非 w+h 处导数。
- h=0 不计算差商；每轮重置缺省值，避免沿用旧值。
- 计算数据与显示文字分开：数值可用 `:.4f`，`None` 单独显示；格式化不会提高计算精度。

来源：沿用前课 OpenStax §3.6 链式法则；NumPy beginners 是本课推荐主来源，未重新抓取；Python tutorial §7.1.1 的 f-string 文档本课已查阅。数值案例为教师自拟，代码由学生编写。

上一课：[05 非线性链](/posts/llm-math-numpy-05/)。

*本文于2026-10-30整理公开，日期为导入日期。*
