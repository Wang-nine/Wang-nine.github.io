---
title: "01 前向预测与 MSE：从 batch 输入到标量损失"
published: 2026-10-26
description: "用一个 batch 的矩阵乘法理解线性预测，并把逐样本误差压成标量 MSE；附 shape 链、手算示例与 broadcasting 易错点。"
image: ''
tags: ["LLM", "NumPy", "数学基础", "MSE"]
category: "LLM 学习"
draft: false
lang: zh_CN
slug: "llm-math-numpy-01"
---

> 复习提纲，对应 M2.1 形状与 M2.5 broadcasting 基础；不是掌握记录，也不是练习答案。

## 1. 本课位置

把一批样本的线性预测写成矩阵乘法，再把预测与目标的差压成一个标量 loss。只算数值与 shape，不推导梯度。

## 2. 术语与三个身份

- **feature**：一列输入，共 `D` 个。
- **sample**：一行输入，一个样本。
- **batch**：一次算的 `N` 个样本，矩阵 `X` 形状 `(N, D)`。

| 名称 | 角色 | 是否随样本变化 |
| --- | --- | --- |
| `X (N, D)` | 输入 input | 是 |
| `w (D, 1)`、`b ()` | 模型参数 parameters | 否，全样本共用 |
| `y (N, 1)` | 目标 target | 是，只在 loss 里出现 |

`b` 是显式 bias，不占 `X` 的列，只给所有样本同一个偏移。

## 3. 形状链

```text
X (N, D) @ w (D, 1) -> z (N, 1)
z + b               -> p (N, 1)      b 广播到每行
p - y               -> residual (N, 1)
residual ** 2       -> squared (N, 1)
mean(squared)       -> MSE ()
```

`p = X @ w + b`、`residual = p - y`、`MSE = mean(residual ** 2)`。

| 名称 | 形状 | 含义 |
| --- | --- | --- |
| `X` | `(N, D)` | batch 输入 |
| `w` | `(D, 1)` | 每个 feature 一个权重 |
| `b` | `()` | 标量 bias，广播到每行 |
| `p` | `(N, 1)` | 每个样本一个预测 |
| `y` | `(N, 1)` | 目标，须与 `p` 对齐 |
| `residual` | `(N, 1)` | `p - y`，逐样本误差 |
| `MSE` | `()` | 所有平方误差的平均，标量 |

`(N, D) @ (D, 1) -> (N, 1)` 不是维度抵消：`D` 是每个输出内部的求和长度。

$$
p_i = \sum_{j=1}^{D} X_{ij} w_j + b
$$

## 4. 一个 batch 的手算

```text
X = [[2, 1], [4, 2]]    w = [[2], [3]]    b = 5    y = [[13], [17]]
p = [[12], [19]]         # 2*2 + 1*3 + 5, 4*2 + 2*3 + 5
residual = [[-1], [2]]
```

$$
\mathrm{MSE} = \frac{1 + 4}{2} = 2.5
$$

`y` 必须写成 `(2, 1)`；写成 `[13, 17]` 就是 `(2,)`，减法会进另一套 broadcasting。residual 为正表示预测高于目标，为负表示低于目标，MSE 会把符号丢掉。

## 5. 易错点

**MSE 的单位与平均抵消。**

$$
\mathrm{MSE} = \frac{1}{M} \sum_{i=1}^{M} \mathrm{residual}_i^2
$$

`M` 是参与平均的元素个数（当前 `p (N, 1)` 时 `M = N`）。若 `p`、`y` 以元计，residual 是元，`residual ** 2` 与 MSE 是元²，不能说"MSE 是 2.5 元"。`residual = [+3, -3]` 时：

$$
\operatorname{mean}(\mathrm{residual}) = 0, \qquad
\mathrm{MSE} = \frac{9 + 9}{2} = 9
$$

正负抵消不代表预测准，比较模型看 MSE。MSE 为 0 当且仅当所有 residual 都为 0。

**size 与 shape[0]。** `X.size = N * D` 是元素总数，`shape[0] = N` 只是第一轴长度，第一轴是否表示样本取决于任务约定。`p (N, 1)` 的 `size = N` 只因输出宽度为 1；若 `p (N, K)`，全元素平均的分母是 `N * K`，不是 `N`。

**三种 size 1。**

```text
np.array([5])    -> (1,)    ndim 1
np.array([[5]])  -> (1, 1)  ndim 2
np.array(5)      -> ()      ndim 0
```

元素个数相同，但轴的划分与能参与的运算不同。

**broadcasting。** 从最右轴对齐，逐轴长度相等或其中一个为 1，缺的左侧轴当作 1。最大的坑是 `p (N, 1) - y (N,) -> (N, N)`：`y` 被当作 `(1, N)`，每个预测都去减每个目标。`N = 1` 时结果可能仍是 `(1, 1)`，错误被藏起来，所以单样本测试不能替代多样本检查。shape 相等也不等于样本对齐，还要核对样本顺序与含义。

**reshape 与 guard。** `reshape` 只改轴划分、元素总数不变；broadcasting 只扩展运算视角、不改输入 shape。任务要求先确认 `p.shape == y.shape` 再相减：打印一行警告不是 guard，residual 与 MSE 必须放在合法分支里，形状不匹配时整个 loss 都不执行。

## 6. 速查与入口

- `X (N, D)`、`w (D, 1)`、`b ()`、`p` 与 `y (N, 1)`、MSE `()`。
- `p` 与 `y` 表示同样的 `N` 个样本，顺序一一对应。
- 不是只打印警告：mismatch 时下游 loss 完全不执行，不留下半成品结果。
- MSE 是有限的标量；`np.mean(residual ** 2)` 的分母是元素总数。
- `N = 1` 通过不代表多样本形状正确。

来源：[NumPy: the absolute basics for beginners](https://numpy.org/doc/stable/user/absolute_beginners.html)、[numpy.mean](https://numpy.org/doc/stable/reference/generated/numpy.mean.html)。

*本文于2026-10-26整理公开，日期为导入日期。*
