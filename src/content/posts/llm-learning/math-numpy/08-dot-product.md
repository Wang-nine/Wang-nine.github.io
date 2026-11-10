---
title: "08 点积、内积、外积与叉积"
published: 2026-11-09
description: "区分逐元素乘法、点积、标准内积、外积与三维叉积，结合 NumPy shape 检查与学生代码快照说明样本配对和运算边界。"
image: ''
tags: ["LLM", "NumPy", "数学基础", "点积", "向量"]
category: "LLM 学习"
draft: false
lang: zh_CN
slug: "llm-math-numpy-08"
---

> M2.1 / M2.2：对应相乘、求和与 shape。本课练习限实数向量；内积术语与三维叉积是应学生要求补充的速查，未作掌握评估。

## 1. 先看是否求和

把每个 feature 与其权重相乘，得到各项贡献；再求和，才得到一个总分。

```text
x、w (D,) → 对应相乘 → 各项贡献 (D,) → 求和 → 点积 ()
```

| 运算 | 含义 | 输出 |
| --- | --- | --- |
| elementwise multiplication 逐元素乘法 | 对应位置相乘，不自动求和 | 同 shape 时保留该 shape；不同 shape 须满足 broadcasting |
| dot product 点积 | 等长实数向量对应相乘后求和 | 数学上是标量 |
| inner product 内积 | 更一般的概念，用来定义长度、夹角等；本课点积就是实数欧氏空间的标准内积 | 标量 |
| outer product 外积 | 保留两个向量所有元素之间的配对 | 长度 M 与 N 得到 M×N 矩阵 |
| cross product 叉积 | 本笔记指三维向量产生法向量的运算 | 三维向量，不是矩阵 |

## 2. 点积与标准内积

$$
\langle\mathbf{x},\mathbf{w}\rangle
=\mathbf{x}\cdot\mathbf{w}
=\sum_{j=1}^{D}x_jw_j
$$

不默认取平均。只有在本课的实数标准内积语境中这样等同；复杂空间或其他内积定义不能直接照搬。NumPy 的 `dot` / `@` 对复数不自动取共轭，本课不展开复数内积。

## 3. 外积保留所有配对

列向量 x 长 M，列向量 w 长 N：

$$
A=\mathbf{x}\mathbf{w}^{\mathsf T},\qquad A_{ij}=x_iw_j
$$

每一行是 x 的一个元素乘上整个 w。这里矩阵乘法的内部长度为 1，每个位置只含一个乘积；它不是点积的求和结果。

## 4. shape 速查与一个例子

| NumPy 输入与表达式 | 输出 shape |
| --- | --- |
| `(D,) * (D,)` | `(D,)` |
| `(D,) @ (D,)` | `()` |
| 列向量 `x.T @ w`：`(1,D) @ (D,1)` | `(1,1)` |
| 列向量 `x @ w.T`：`(M,1) @ (1,N)` | `(M,N)` |
| 两个列向量 `(D,1) @ (D,1)`，D>1 | 内维不匹配，报错 |
| batch `(N,D) @ (D,)` | `(N,)` |
| batch `(N,D) @ (D,1)` | `(N,1)` |

本课 x=(2,1,3)、w=(4,-2,1)：

$$
\mathbf{x}\cdot\mathbf{w}=8-2+3=9,\qquad
\mathbf{x}\mathbf{w}^{\mathsf T}=
\begin{bmatrix}8&-4&2\\4&-2&1\\12&-6&3\end{bmatrix}
$$

`9` 与 `[[9]]` 含有相同数值，但 shape 分别为 `()` 与 `(1,1)`。一维数组没有独立的行轴 / 列轴，`.T` 不会把 `(D,)` 变成 `(1,D)`；先明确轴结构，再使用转置。

## 5. 叉积：补充速查，尚未练习

直觉：两条不平行的三维向量张成一个平面，叉积给出垂直该平面的方向，按右手定则确定；大小等于它们张成的平行四边形面积。平行向量或零向量的叉积为零向量，不再有唯一的法向方向。

```text
两个三维向量 a、b → 叉积 → 垂直二者的三维向量 c
NumPy：a (3,)、b (3,) → np.cross(a,b) (3,)
```

$$
\mathbf{a}\times\mathbf{b}=
\begin{bmatrix}
a_2b_3-a_3b_2\\
a_3b_1-a_1b_3\\
a_1b_2-a_2b_1
\end{bmatrix}
$$

**叉积 ≠ 本课的 outer product。** 有些几何教材也把叉积称为“外积”，因此看英文与输出类型区分：本笔记 outer product 是矩阵，cross product 是三维向量。不要求现在写叉积实现。

## 6. 保住样本配对

```text
p (N,)   - y (N,1) → (N,N)  交叉相减（N>1 时明显出错）
p (N,1)  - y (N,1) → (N,1)  样本顺序一致时，逐样本相减
```

Broadcasting 从最右轴对齐，各轴相等或其中一个为 1 才兼容；它扩展运算视角，不修改原数组 shape。shape 相同也不能代替样本顺序与语义对齐检查。`*`、`@`、`np.cross` 是不同运算。

来源：教师在收尾整理时核对 NumPy 官方 [dot](https://numpy.org/doc/stable/reference/generated/numpy.dot.html)、[matmul](https://numpy.org/doc/stable/reference/generated/numpy.matmul.html) 的定义与 Notes，以及 [outer](https://numpy.org/doc/stable/reference/generated/numpy.outer.html)、[cross](https://numpy.org/doc/stable/reference/generated/numpy.cross.html) 的定义。内积与叉积几何解释为教师补充，无学生阅读或练习证明。

上一课：[07 mean 与 sum](/posts/llm-math-numpy-07/)。

## 附录：学生代码快照

以下是学生当前已保存的实现，仅供复习；不是教师参考答案，也不是独立掌握证明。原练习文件是唯一编辑源；快照不会自动同步，原文件后续修改后需重新生成。

### dot_product_check.py


```python
'''
Author: Wang-nine Wang-nine@users.noreply.github.com
Date: 2026-11-09 15:08:31
LastEditors: Wang-nine Wang-nine@users.noreply.github.com
LastEditTime: 2026-11-09 17:13:12
Description: it is a long time from last learning cuz too busy recently
'''
import numpy as np

def main():
    x = np.array([2, 1, 3])
    w = np.array([4, -2, 1])
    oneD_vector_test(x, w)
    twoD_vector_test(x, w)

def oneD_vector_test(x: np.ndarray, w: np.ndarray) -> None:
    #implement dot product by three ways
    dot_product_1 = 0
    for i in range(x.shape[0]):
        dot_product_1 += x[i] * w[i]
    dot_product_2 = np.sum(x * w)
    dot_product_3 = x @ w
    if dot_product_1 == dot_product_2 == dot_product_3:
        print(f"loop dot product value = {dot_product_1}, shape = {dot_product_1.shape}")
        print(f"the sum of each element dot product value = {dot_product_2}, shape = {dot_product_2.shape}")
        print(f"the @ signal dot product value = {dot_product_3}, shape = {dot_product_3.shape}")
    else:
        print("计算出的点积不一致，请检查！")


def twoD_vector_test(x: np.ndarray, w: np.ndarray) -> None:
    x = x.reshape(x.shape[0], 1)
    w = w.reshape(w.shape[0], 1)
    #x * w
    print(f"the value of x * w = {x * w}, the shape of x * w = {(x * w).shape}")
    #x @ w
    try:
        print(f"x @ w = {x @ w}, the shape of x @ w = {(x @ w).shape}")    
    except ValueError:
        print("can not calculate x @ w")
    #x.T @ w
    try:
        print(f"x.T @ w = {x.T @ w}, the shape of x.T @ w = {(x.T @ w).shape}")
    except ValueError:
        print("can not calculate x.T @ w")
    #x @ w.T
    try:
        print(f"x @ w.T = {x @ w.T}, the shape of x @ w.T = {(x @ w.T).shape}")    
    except ValueError:
        print("can not calculate x @ w.T")

if __name__ == "__main__":
    main()
```

*本文于2026-11-09整理公开，日期为导入日期。*
