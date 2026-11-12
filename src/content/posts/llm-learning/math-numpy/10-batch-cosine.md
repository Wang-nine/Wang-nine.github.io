---
title: "10 batch cosine：每行使用自己的长度"
published: 2026-11-12
description: "说明 batch cosine 的逐行归一化、axis 与 keepdims、广播陷阱及 allclose 检查边界，并保留学生代码快照。"
image: ''
tags: ["LLM", "NumPy", "数学基础", "cosine similarity", "broadcasting"]
category: "LLM 学习"
draft: false
lang: zh_CN
slug: "llm-math-numpy-10"
---

> M2.2 + M2.5，结合 M2.3 norm。一个查询对一批样本；不计算所有样本两两相似度。

## 1. 一个样本，一个分数

X 的每行是一个样本，q 是共用查询。查询长度可共用，每个样本必须除以自己的长度。

$$
n_i=\sqrt{\sum_{j=1}^{D}X_{ij}^2},\qquad
s_i=\frac{\mathbf{x}_i\cdot\mathbf q}{n_i\|\mathbf q\|_2}
$$

```text
X (N,D) → 每行 norm (N,1) → 逐行归一化 X̂ (N,D)
q (D,)  → 查询 norm       → 单位查询 q̂ (D,)
X̂ @ q̂ → 分数 (N,)
```

## 2. axis 选归约轴，keepdims 决定保轴

| 操作 | 输出 shape | 含义 |
| --- | --- | --- |
| `sum(X**2, axis=1)` | `(N,)` | 沿第二个轴汇总 feature，保留 N 个样本值 |
| `sum(X**2, axis=1, keepdims=True)` | `(N,1)` | 同样求和，被归约的轴保留为长度 1 |
| `X / row_norms`，row_norms 为 `(N,1)` | `(N,D)` | 每行所有 feature 都除以该行长度 |

开平方不改变这些 shape。`axis=1` 不是归约第一个轴；`keepdims` 不改变数值，也不决定归约哪个轴。

**方阵会隐藏错误**：当 X 为 `(2,2)`、两行长度为 5 和 10 时：

```text
分母 (2,)   [5,10]       → 广播视角 [[5,10],[5,10]]   按列分配，错
分母 (2,1)  [[5],[10]]   → 广播视角 [[5,5],[10,10]]   按行分配，对
```

两者都能运行、都输出 `(2,2)`，但语义不同。广播不修改原数组的 shape。

## 3. 归一化与测试边界

- 仅把一行乘正数：该行方向不变，cosine 不变；其他行也不变。负数倍只让该行分数取相反数。
- 本练习拒绝错误维数、空 batch / feature、feature 数不匹配、零查询或任意零行；不静默删样本。
- 循环版先点积再除长度，数组版先单位化再点积，浮点运算次序不同可产生微小差异。接近零的小误差可在适当容差内接受，但不能默认所有偏差都无害，也不提前 round 掩盖问题。

## 4. allclose 不是完整的通过条件

1. 正常用例：计算成功返回 → 每版 shape 为 `(N,)` → 与独立预期核对 → 两版在容差内一致。
2. 异常用例：确认按预期抛错，不比较占位结果。
3. `allclose` 使用 broadcasting，shape 不同也可能为 True；两版同时算错也可能一致。
4. 两个空数组 allclose 为 True，不证明算出有效分数。当前程序以“两个结果都非空”防止假通过，仅适用于本课拒绝空 batch 的约定；仍是打印检查，不是完整自动断言测试。

```text
np.array([])：shape (0,)，size 0，空数组
np.array(0)： shape ()，  size 1，标量，不是空输入
```

来源：[NumPy sum](https://numpy.org/doc/stable/reference/generated/numpy.sum.html) 的 axis / keepdims 参数与 Returns，教师本课收尾已核对；cosine 定义沿用上一课。allclose 官方页本次抓取失败，相关现象由本地检查确认；没有学生阅读证明。

上一课：[09 cosine](/posts/llm-math-numpy-09/)。

## 附录：学生代码快照

以下为学生当前保存的实现，仅供复习，不是教师参考答案或掌握证明。原文件是唯一编辑源，快照不会自动同步；本版本仍为打印式测试，极端数值健壮性未评估。

### batch_cosine_check.py


```python
'''
Author: Wang-nine Wang-nine@users.noreply.github.com
Date: 2026-11-11 20:57:20
LastEditors: Wang-nine Wang-nine@users.noreply.github.com
LastEditTime: 2026-11-12 15:46:48
Description: just studying
'''
import numpy as np

def main():
    #error check
    test_cosine_similarity(np.array([3, 4]), np.array([3, 4]))
    test_cosine_similarity(np.array([[], []]), np.array([]))
    test_cosine_similarity(np.array([[0, 0]]), np.array([1, 2]))
    test_cosine_similarity(np.array([[3, 4]]), np.array([0, 0]))
    test_cosine_similarity(np.array([[3, 4]]), np.array([3, 4, 5]))
    #example test
    test_cosine_similarity(np.array([[3, 4], [6, 8], [-4, 3]]), np.array([3, 4]))
    test_cosine_similarity(np.array([[3, 4], [6, 8]]), np.array([3, 4]))
    test_cosine_similarity(np.array([[3, 4]]), np.array([3, 4]))

def test_cosine_similarity(X: np.ndarray, q: np.ndarray) -> None:
    loop_cosine = np.array([])
    vectorized_cosine = np.array([])
    try:
        loop_cosine = batch_cosine_loop(X, q)
        print(loop_cosine)
        print(f"loop cosine shape is {loop_cosine.shape}, if it has the same shape of (X.shape[0], ) : {loop_cosine.shape == (X.shape[0], )}")
    except ValueError as e:
        print(e)
    try:
        vectorized_cosine = batch_cosine_vectorized(X, q)
        print(vectorized_cosine)
        print(f"loop vectorized shape is {vectorized_cosine.shape}, if it has the same shape of (X.shape[0], ) : {vectorized_cosine.shape == (X.shape[0], )}")
    except ValueError as e:
        print(e)
    if loop_cosine.size != 0 and vectorized_cosine.size != 0:
        try:
            print(f"loop cosine shape is {loop_cosine.shape}, vectorized cosine shape is {vectorized_cosine.shape}")
            if loop_cosine.shape != vectorized_cosine.shape:
                raise ValueError("loop cosine result's shape is not as same as vectorized cosine shape")
            print(f"if the loop batch cosine is same as vectorized batch cosine : {np.allclose(loop_cosine, vectorized_cosine)}")
        except ValueError as e:
            print(e)

def l2_norm(x: np.ndarray) -> float:
    if x.ndim != 1:
        raise ValueError("pls make sure the array's just have one dimension!")
    if x.size == 0:
        raise ValueError("pls make sure the vector is not empty!")
    return np.sum(x * x) ** 0.5

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:        
    #verify the vector is valid
    if a.ndim != 1 or b.ndim != 1:
        raise ValueError("pls make sure the array's just have one dimension!")
    elif a.size != b.size:
        raise ValueError("pls check the size of a be have the same size of b!")
    #calculate the cosine similarity
    return (a @ b) / (l2_norm(a) * l2_norm(b))

def batch_cosine_loop(X: np.ndarray, q: np.ndarray) -> np.ndarray:
    batch_cosine_error_check(X, q)
    res = []
    for sample in X:
        cosine_value = float(cosine_similarity(sample, q))
        res.append(cosine_value)
    return np.array(res)

def batch_cosine_vectorized(X: np.ndarray, q: np.ndarray) -> np.ndarray:
    batch_cosine_error_check(X, q)
    X_normalization = X / (np.sum(X ** 2, axis=1, keepdims=True) ** 0.5)
    q_normalization = q / (np.sum(q ** 2, axis=0, keepdims=True) ** 0.5)
    return X_normalization @ q_normalization
 
def batch_cosine_error_check(X: np.ndarray, q: np.ndarray) -> None:
    if X.ndim != 2 or q.ndim != 1:
        raise ValueError("pls make sure the array have correct dimension!")
    if X.shape[1] != q.size:
        raise ValueError("pls make sure theirs' shape is correct!")
    if X.size == 0 or q.size == 0:
        raise ValueError("pls make sure the vector is not empty!")
    if np.any(np.all(X == 0, axis=1)) or np.any(np.all(q == 0)):
        raise ValueError("pls make sure that array can not contains any row made entirely of zeros!")


if __name__ == "__main__":
    main()
```

*本文于2026-11-12整理公开，日期为导入日期。*
