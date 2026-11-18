---
title: "13 离散期望与最可能结果"
published: 2026-11-18
description: "区分离散期望与众数，使用概率加权求和并核对结果与概率的配对。"
image: ''
tags: ["LLM", "NumPy", "数学基础", "概率", "期望"]
category: "LLM 学习"
draft: false
lang: zh_CN
slug: "llm-math-numpy-13"
---

最可能结果（众数，mode）问“哪个结果值出现的概率最大”；期望（expectation）问“考虑所有可能结果，平均是多少”。两者定义不同，数值可以相等。

$$
\mathbb E[X]=\sum_{i=1}^{K}p_i x_i,\qquad p_i\ge 0,\quad \sum_i p_i=1
$$

**一个例子**：结果 `[9,9,99]` 对应概率 `[0.4,0.3,0.3]`。结果 9 的概率为 0.7，所以众数为 9；期望为 `9 × 0.7 + 99 × 0.3 = 36`。单次不会得到 36，因为 36 不是可能结果。

- `values (K,)` 与 `probs (K,)` 的点积给出标量 `()`；结果值可以为负，概率不能。概率已归一化，不再除以 `K`。
- 同步重排只改变求和顺序。只重排一侧可能改变结果与概率的配对，即使 shape 仍相同。
- 两版一致不等于符合预期；上例的手算值 36 可以直接用于核对。

来源：[OpenStax §4.2（期望部分）](https://openstax.org/books/introductory-statistics-2e/pages/4-2-mean-or-expected-value-and-standard-deviation)。

## 附录：学生代码快照

原练习文件 是唯一编辑源；下面是本课保存的版本，不自动同步。

```python
'''
Author: Wang-nine Wang-nine@users.noreply.github.com
Date: 2026-11-17 10:32:06
LastEditors: Wang-nine Wang-nine@users.noreply.github.com
LastEditTime: 2026-11-18 14:24:52
Description: still studying  
'''
import numpy as np

def main():
    #error test
    test_expectation(np.array([]), np.array([]))
    test_expectation(np.array([[0], [1]]), np.array([[0.5, 0.5]]))
    test_expectation(np.array([0, 1, 2]), np.array([0.5, 0.5]))
    test_expectation(np.array([np.inf]), np.array([1]))
    test_expectation(np.array([0, 1, 2]), np.array([-0.1, 0.5, 0.6]))
    test_expectation(np.array([0, 1, 2]), np.array([0.5, 0.5, 0.5]))
    #example test
    test_expectation(np.array([0, 2, 10]), np.array([0.4, 0.3, 0.3]))
    test_expectation(np.array([10, 2, 0]), np.array([0.3, 0.3, 0.4]))
    test_expectation(np.array([-2, 2]), np.array([0.5, 0.5]))
    test_expectation(np.array([9, 9, 99]), np.array([0.4, 0.3, 0.3]))

def fmt(a: np.ndarray) -> str:
    return np.array2string(a, precision=3, floatmode="fixed", separator=", ")    

def test_expectation(values: np.ndarray, probs: np.ndarray) -> None:
    loop_expectation = None
    vectorized_expectation = None
    try:
        res = expectation_loop(values, probs)
        print(f"the loop expectation result of {fmt(values)} and {fmt(probs)} is {res}")
        loop_expectation = res
    except ValueError as e:
        print(e)

    try:
        res = expectation_vectorized(values, probs)
        print(f"the vectorized expectation result of {fmt(values)} and {fmt(probs)} is {res}")
        vectorized_expectation = res
    except ValueError as e:
        print(e)

    if loop_expectation is not None and vectorized_expectation is not None:
        print(f"the two results is the same? : {np.isclose(loop_expectation, vectorized_expectation, atol=1e-5, rtol=0)}")

def expectation_loop(values: np.ndarray, probs: np.ndarray) -> float:
    expectation_before_check(values, probs)
    result = 0
    for value, prob in zip(values, probs):
        result += value * prob
    return result

def expectation_vectorized(values: np.ndarray, probs: np.ndarray) -> float:
    expectation_before_check(values, probs)
    return float(values @ probs)

def expectation_before_check(values: np.ndarray, probs: np.ndarray) -> None:
    #error check
    if values.size == 0 or probs.size == 0:
        raise ValueError("pls make sure vector can not be empty!")
    if values.ndim != 1 or probs.ndim != 1:
        raise ValueError("pls make sure vector just have one dimension!")
    if values.size != probs.size:
        raise ValueError("pls make sure that values should has same size as probs!")
    if np.any(np.isnan(values)) or np.any(np.isnan(probs)):
        raise ValueError("pls check vector should not contains any Nan element!")
    if np.any(np.isinf(values)) or np.any(np.isinf(probs)):
        raise ValueError("pls check vector should not contains any infinite element!")
    if not np.all(probs >= 0):
        raise ValueError("pls make sure the probs vector should not have negative elements!")
    if not np.isclose(probs.sum(), 1.0, atol=1e-8, rtol=0):
        raise ValueError("pls make sure the sum of the probs is 1!")

if __name__ == "__main__":
    main()
```

*本文于2026-11-18整理公开，日期为导入日期。*
