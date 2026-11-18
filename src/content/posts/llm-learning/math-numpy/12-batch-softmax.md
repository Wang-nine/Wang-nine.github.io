---
title: "12 batch softmax：每行是一份概率分布"
published: 2026-11-18
description: "逐行归一化 batch softmax，理解 axis、keepdims、稳定平移和下溢边界。"
image: ''
tags: ["LLM", "NumPy", "数学基础", "softmax", "数值稳定性"]
category: "LLM 学习"
draft: false
lang: zh_CN
slug: "llm-math-numpy-12"
---

> M2.2 + M2.5。本课输入为非空二维有限实数数组；每行一个样本，每列一个候选。

## 1. 行独立，沿候选列归一化

$$
P_{ij}=\frac{e^{Z_{ij}}}{\sum_{k=1}^{K}e^{Z_{ik}}},
\qquad \sum_{j=1}^{K}P_{ij}=1
$$

每个样本分配自己的一份概率，不让所有样本共用一个分母。N 行的全部概率加起来是 N，不是 1。

```text
分数 Z (N,K) → exp 权重 (N,K)
              ↓ axis=1, keepdims=True 求和
每行分母 (N,1) → 按行广播相除 → 概率 P (N,K)
```

- axis=1 是第二个轴（候选列）；“按行独立”不等于“沿样本轴 axis=0 求和”。
- keepdims 保留归约轴为长度 1；广播只扩展运算视角，不修改原分母 shape。
- 分母加的是 exp 权重，不是已经归一化后的概率。概率再次输入 softmax 会成为新的分数，通常改变结果。

## 2. 稳定版本也逐行求最大值

$$
m_i=\max_j Z_{ij},\qquad
P_{ij}=\frac{e^{Z_{ij}-m_i}}{\sum_k e^{Z_{ik}-m_i}}
$$

行最大值为 `(N,1)`，平移后仍为 `(N,K)`；每行至少有一个权重为 1，所以该行分母不为零。

$$
\begin{bmatrix}
1000&1001&1002\\
-1000&-1000&-1000
\end{bmatrix}
\ \longrightarrow\
\begin{bmatrix}
-2&-1&0\\
0&0&0
\end{bmatrix}
$$

若整批都减全局最大值 1002，第二行变成 `[-2002,-2002,-2002]`；在 float64 中 exp 会全部下溢成 0，归一化时 `0/0 → NaN`。
**单个权重下溢不一定使整行失效；这里的危险是整行权重都为零。** 全局平移在精确数学上等价，不保证浮点稳定性相同。

## 3. 平移与候选之间的关联

- 给某行所有分数加同一个常数：该行 exp 权重共同乘一个因子，概率不变；其他行也不变。
- 只提高某行一个候选的分数：多个候选时，该候选概率增加、同一行其他概率减少；其他行不受影响。
- 使用的是指数规则，不是对数加法规则：

$$
e^{z_j+c}=e^c e^{z_j}
$$

## 4. shape 与验证速查

| 输入 | 含义 / 输出 |
| --- | --- |
| `(1,K)` | 单样本，输出仍 `(1,K)`，不是 `(K,)` |
| `(N,1)` | 每个样本只有一个候选，输出各行为 1 |
| `(0,K)` 或 `(N,0)` | 空轴，本练习拒绝 |
| `(K,)`、含 NaN / inf | 不满足二维有限输入约定，拒绝 |

先查输出 shape、有限性、非负，再沿 axis=1 检查每行和接近 1；最后才比较两版。两版都正确归一化也不能单靠相互一致证明数值符合独立预期。
测试 NaN / inf 时保持二维，否则会先被维数检查拒绝。打印标签 basic / shift invariance 是学生保留文案，本课循环版和数组版实际都使用稳定平移。

来源：沿用上课教师已核对的 [SciPy softmax](https://docs.scipy.org/doc/scipy/reference/generated/scipy.special.softmax.html) 的 axis、Returns、Notes；本课未重新抓取。数值与下溢示例为教师讲解，练习由学生实现。

上一课：[11 softmax](/posts/llm-math-numpy-11/)。

## 附录：学生代码快照

以下仅复制学生当前保存的实现，不是教师参考答案或完整掌握证明。原文件是唯一编辑源，快照不会自动同步；后续修改需重新生成。

### batch_softmax_check.py


```python
'''
Author: Wang-nine Wang-nine@users.noreply.github.com
Date: 2026-11-16 10:58:37
LastEditors: Wang-nine Wang-nine@users.noreply.github.com
LastEditTime: 2026-11-16 16:40:55
'''
import numpy as np

def main():
    #error test
    test_batch_softmax(np.array([]))
    test_batch_softmax(np.array([[np.nan]]))
    test_batch_softmax(np.array([[np.inf]]))
    #example test
    test_batch_softmax(np.array([[0, np.log(2), np.log(3)], [0, 0, 0]]))
    test_batch_softmax(np.array([[1000, 1001, 1002], [-1000, -1000, -1000]]))
    test_batch_softmax(np.array(([[1, 2, 3]])))
    test_batch_softmax(np.array([[3], [9]]))
    
def fmt(a: np.ndarray) -> str:
    return np.array2string(a, precision=3, floatmode="fixed", separator=", ")    

def test_batch_softmax(Z: np.ndarray) -> None:
    basic_res = None
    stable_res = None
    try:
        res = batch_softmax_loop(Z)
        softmax_after_check(Z, res)
        print(f"the basic softmax result of {fmt(Z)} is {fmt(res)}")
        basic_res = res
    except ValueError as e:
        print(e)

    try:
        res = batch_softmax_vectorized(Z)
        softmax_after_check(Z, res)
        print(f"the shift invariance softmax result of {fmt(Z)} is {fmt(res)}")
        stable_res = res
    except ValueError as e:
        print(e)

    if isinstance(basic_res, np.ndarray) and isinstance(stable_res, np.ndarray) and basic_res.shape == stable_res.shape:
        print(f"the two results is the same? : {np.allclose(basic_res, stable_res, atol=1e-5, rtol=0)}")

def batch_softmax_loop(Z: np.ndarray) -> np.ndarray:
    softmax_before_check(Z)
    res = []
    for row in Z:
        row_max = np.max(row)
        row_sum = np.sum(np.exp((row - row_max)))
        row_weight = np.exp((row - row_max)) / row_sum
        res.append(row_weight)
    return np.stack(res)

def batch_softmax_vectorized(Z: np.ndarray) -> np.ndarray:
    softmax_before_check(Z)
    row_max = np.max(Z, axis=1, keepdims=True)
    row_sum = np.sum(np.exp(Z - row_max), axis=1, keepdims=True)
    return np.exp((Z - row_max)) / row_sum

def softmax_before_check(Z: np.ndarray) -> None:
    #error check
    if Z.size == 0:
        raise ValueError("pls make sure vector can not be empty!")
    if Z.ndim != 2:
        raise ValueError("pls make sure vector just have two dimension!")
    if np.any(np.isnan(Z)):
        raise ValueError("pls check vector should not contains any Nan element!")
    if np.any(np.isinf(Z)):
        raise ValueError("pls check vector should not contains any infinite element!")

def softmax_after_check(Z: np.ndarray, result: np.ndarray) -> None:
    #result check
    if Z.shape != result.shape:
        raise ValueError("pls check the input's shape is same as result's shape!")
    if np.any(np.isnan(result)):
        raise ValueError("pls check the result should not have NaN values!")
    if np.any(np.isinf(result)):
        raise ValueError("pls check the result should not have infinite values!")
    if not np.all(result >= 0):
        raise ValueError("pls check the result should not contains negative element!")
    if not np.all(np.isclose(result.sum(axis=1), 1.0, atol=1e-8, rtol=0)):
        raise ValueError("pls make sure the sum of result should close to 1.0!")

if __name__ == "__main__":
    main()
```

*本文于2026-11-18整理公开，日期为导入日期。*
