---
title: "11 softmax：从分数到概率"
published: 2026-11-14
description: "说明一维 softmax 的概率归一化、平移不变性、减最大值的稳定实现与浮点容差，并保留代码快照和验证边界。"
image: ''
tags: ["LLM", "NumPy", "数学基础", "softmax", "数值稳定性"]
category: "LLM 学习"
draft: false
lang: zh_CN
slug: "llm-math-numpy-11"
---

> M2.2，连接 M2.3 概率。本课仅一维非空有限实数输入；正文为复习提纲，文末为学生代码快照。

## 1. 三层量不要混

原分数可为负，直接除以分数总和不保证得到概率。softmax 先产生正权重，再分配份额：

```text
分数 z (K,) → exp → 正权重 (K,) → 除以权重总和 → 概率 p (K,)
```

$$
w_i=e^{z_i},\qquad p_i=\frac{w_i}{\sum_{j=1}^{K}w_j}
$$

- exp 确保权重为正并保留大小顺序；除以权重总和才使概率和为 1。
- 概率分布的基本要求是非负、总和为 1；保留输入分数顺序是 softmax 的性质。
- L2 单位化保方向、使长度为 1；softmax 使非负分量之和为 1，一般不保留输入向量方向。两者都输出向量，不是标量 / 向量运算之分。

## 2. 平移不变，不等于缩放不变

所有分数加同一常数 c，正权重共同乘以同一个因子，归一化后抵消：

$$
\frac{e^{z_i+c}}{\sum_j e^{z_j+c}}
=\frac{e^c e^{z_i}}{e^c\sum_j e^{z_j}}
=\frac{e^{z_i}}{\sum_j e^{z_j}}
$$

分数乘 2 则让各正权重分别平方，比例一般改变：

$$
e^{2z_i}=(e^{z_i})^2
$$

正缩放不改变排名，但会改变概率。乘 2 使分布更集中于最大分候选，不保证每个“较高分”项的概率都增加；全等分数仍均匀。

## 3. 稳定实现：减去最大值

$$
m=\max_j z_j,\qquad
p_i=\frac{e^{z_i-m}}{\sum_j e^{z_j-m}}
$$

所有指数输入不大于 0，最大正权重为 1，分母至少为 1；数学上与原公式等价，不是截断概率。它避免直接对大正数 exp 导致溢出，极小权重仍可能下溢为 0；极端 dtype / 数值健壮性本课未全面评估。

一组例子：`[1000,1001,1002]` 平移为 `[-2,-1,0]`，stable 输出约 `[0.09003057,0.24472847,0.66524096]`。basic 在该大数用例会出现 overflow / invalid divide 警告；不能因此跳过 stable 测试。

## 4. 容差不是小数位

浮点数通常不要求完全相等，而是让实际值 a 接近预期值 b：

$$
|a-b|\le \mathrm{atol}+\mathrm{rtol}|b|
$$

- atol 是绝对误差限，rtol 是相对于 b 的误差比例；rtol=0 时只看绝对误差。
- `isclose` 逐元素判断，`allclose` 要求所有元素接近。shape 仍须另查，两版一致也不能代替独立预期。
- 检查概率和接近 1 只是容差的一种用途；也可核对手算向量和共同平移前后的输出。
- `precision=3` 只改变显示，不改变数值，也不等于容差为 0.001。

## 5. 本次实现与验证边界

- 两个计算函数自身拒绝空、二维、NaN、无穷大；全零分数合法，输出均匀概率，单候选输出 `[1]`。
- 测试先查 shape、有限性、非负、总和，再保存有效结果；None 表示尚无有效结果，不比较失败占位。
- basic 与 stable 独立尝试，basic 大数失败后 stable 仍继续。当前脚本会保留 basic 溢出的两条 RuntimeWarning。
- 学生选择不再增加独立手算 / 平移对照用例；教师已额外只读核对，不冒充学生测试代码。现有脚本仍不是覆盖所有输入的完整验证。

来源：[SciPy softmax](https://docs.scipy.org/doc/scipy/reference/generated/scipy.special.softmax.html) 的定义、Returns 与 Notes（shifting 避免 overflow），本课教师已核对；容差与归一化对比为教师讲解及本地验证，无学生阅读证明。

上一课：[10 batch cosine](/posts/llm-math-numpy-10/)。

## 附录：学生代码快照

以下为学生当前已保存实现，不是教师参考答案或掌握证明。原练习文件是唯一编辑源；快照不会自动同步，原文件修改后需重新生成。

### softmax_check.py


```python
'''
Author: Wang-nine Wang-nine@users.noreply.github.com
Date: 2026-11-14 10:57:29
LastEditors: Wang-nine Wang-nine@users.noreply.github.com
LastEditTime: 2026-11-14 15:11:34
Description: working overtime in Saturday, piece of shit
'''
import numpy as np

def main():
    #error test
    test_softmax(np.array([]))
    test_softmax(np.array([[1], [1]]))
    test_softmax(np.array([np.nan]))
    test_softmax(np.array([np.inf]))
    #example test
    test_softmax(np.array([0, np.log(2), np.log(3)]))
    test_softmax(np.array([0, 0, 0]))
    test_softmax(np.array([5]))
    test_softmax(np.array([1000, 1001, 1002]))

def fmt(a: np.ndarray) -> str:
    return np.array2string(a, precision=3, floatmode="fixed", separator=", ")    

def test_softmax(z: np.ndarray) -> None:
    basic_res = None
    stable_res = None
    try:
        res = softmax_basic(z)
        softmax_after_check(z, res)
        print(f"the basic softmax result of {fmt(z)} is {fmt(res)}")
        basic_res = res
    except ValueError as e:
        print(e)

    try:
        res = softmax_stable(z)
        softmax_after_check(z, res)
        print(f"the shift invariance softmax result of {fmt(z)} is {fmt(res)}")
        stable_res = res
    except ValueError as e:
        print(e)

    if isinstance(basic_res, np.ndarray) and isinstance(stable_res, np.ndarray) and basic_res.shape == stable_res.shape:
        print(f"the two results is the same? : {np.allclose(basic_res, stable_res, atol=1e-5, rtol=0)}")

def softmax_basic(z: np.ndarray) -> np.ndarray:
    softmax_before_check(z)
    #calculate softmax in basic style
    weight = np.exp(z)
    return weight / np.sum(weight)

def softmax_stable(z: np.ndarray) -> np.ndarray:
    softmax_before_check(z)
    #calculate softmax while using shift invariance
    weight = np.exp(z - np.max(z))
    return weight / np.sum(weight)

def softmax_before_check(z: np.ndarray) -> None:
    #error check
    if z.size == 0:
        raise ValueError("pls make sure vector can not be empty!")
    if z.ndim != 1:
        raise ValueError("pls make sure vector just have one dimension!")
    if np.any(np.isnan(z)):
        raise ValueError("pls check vector should not contains any Nan element!")
    if np.any(np.isinf(z)):
        raise ValueError("pls check vector should not contains any infinite element!")

def softmax_after_check(z: np.ndarray, result: np.ndarray) -> None:
    #result check
    if z.shape != result.shape:
        raise ValueError("pls check the input's shape is same as result's shape!")
    if np.any(np.isnan(result)):
        raise ValueError("pls check the result should not have NaN values!")
    if np.any(np.isinf(result)):
        raise ValueError("pls check the result should not have infinite values!")
    if not np.all(result >= 0):
        raise ValueError("pls check the result should not contains negative element!")
    if not np.isclose(result.sum(), 1.0, atol=1e-8, rtol=0):
        raise ValueError("pls make sure the sum of result should close to 1.0!")

if __name__ == "__main__":
    main()
```

*本文于2026-11-14整理公开，日期为导入日期。*
