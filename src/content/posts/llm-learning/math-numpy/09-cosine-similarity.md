---
title: "09 L2 norm 与 cosine similarity"
published: 2026-11-12
description: "从 L2 norm 与单位化理解 cosine similarity，说明缩放、零向量及 NumPy 输入检查边界，并保留学生代码快照。"
image: ''
tags: ["LLM", "NumPy", "数学基础", "L2 norm", "cosine similarity"]
category: "LLM 学习"
draft: false
lang: zh_CN
slug: "llm-math-numpy-09"
---

> M2.3 向量长度连接 M2.2 方向相似度。正文是复习提纲；文末为学生当前代码快照，不是完整模块掌握证明。

## 1. 长度与方向分开看

向量像一支从原点出发的箭头。L2 norm 是箭头的长度，即终点到原点的欧氏距离；不是各分量直接相加。点积同时受长度和方向影响，只把箭头拉长也可能使点积变大。

```text
x (D,) → 平方、求和、开平方 → 长度 ()
非零 x → 除以自身长度 → 单位向量 (D,)
两个单位向量 → 点积 → cosine similarity ()
```

$$
\|\mathbf{x}\|_2=\sqrt{\sum_{j=1}^{D}x_j^2}
=\sqrt{\mathbf{x}\cdot\mathbf{x}}
$$

非零向量的单位化保留方向，把长度变为 1（原本是单位向量则不变）：

$$
\widehat{\mathbf{x}}=\frac{\mathbf{x}}{\|\mathbf{x}\|_2},
\qquad \mathbf{x}\ne\mathbf{0}
$$

## 2. 用归一化点积比较方向

$$
\operatorname{cos}(\mathbf{a},\mathbf{b})
=\widehat{\mathbf{a}}\cdot\widehat{\mathbf{b}}
=\frac{\mathbf{a}\cdot\mathbf{b}}{\|\mathbf{a}\|_2\|\mathbf{b}\|_2}
$$

要求两个向量非零、维度相同。除以长度乘积是为了去掉长度对点积的影响，不只是把数值压进一个区间；结果是夹角余弦，位于 `[-1,1]`，不是概率。

| 值 | 几何含义 |
| --- | --- |
| 1 | 同方向 |
| 0 | 垂直 |
| -1 | 反方向 |

本课一组例子：u=(3,4)、v=(6,8)、z=(-3,-4)，长度为 5、10、5。

$$
\widehat{\mathbf{u}}=\widehat{\mathbf{v}}=(0.6,0.8),
\qquad \widehat{\mathbf{z}}=(-0.6,-0.8)
$$

u 与 v 的 cosine 为 1，u 与 z 为 -1。三个单位向量长度相同，不意味着分量符号或方向相同。

## 3. 缩放与零向量

$$
\|c\mathbf{a}\|_2=|c|\|\mathbf{a}\|_2
$$

只缩放 a：正数倍不改变 cosine；负数倍让结果取相反数（原来为 0 仍为 0）。只有 a 的长度被缩放，b 的长度不变。

- 零向量的 L2 norm **合法且为 0**；但没有确定方向，标准 cosine 公式的分母为 0。
- 本练习对 cosine 的零向量输入抛 `ValueError`，不静默返回 0。一些库会约定零向量输出值，不等于数学公式在该点有定义。
- Python 中要写完整分母括号：`dot / (norm_a * norm_b)`，不是 `dot / norm_a * norm_b`。

## 4. 接口与测试边界

- 本练习输入约定：非空、一维实数数组；cosine 两个输入还须等长且非零。
- `l2_norm` 自己检查一维、非空；不能只依赖上层 cosine 的检查。
- 空数组 `[]` 不等于零向量 `[0,0]`，异常信息要匹配条件。
- 每个测试单独捕获预期异常，异常后再跑正常用例，验证控制流继续。
- 当前代码是打印式检查，尚未将预期值写成自动断言；普通数值通过不保证极大 / 极小值或非有限输入的稳定性，这些本课未评估。

来源：[scikit-learn cosine_similarity](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.pairwise.cosine_similarity.html) 的 normalized dot product 定义，本课教师已核对；[NumPy linalg.norm](https://numpy.org/doc/stable/reference/generated/numpy.linalg.norm.html) 本课抓取超时，未声称成功查阅。L2 norm 的勾股直觉与缩放推导为教师补讲；无学生阅读证明。

上一课：[08 点积](/posts/llm-math-numpy-08/)。

## 附录：学生代码快照

以下为学生当前已保存的实现，仅供复习，不是教师参考答案或独立掌握证明。原练习文件是唯一编辑源；快照不会自动同步，原文件修改后需重新生成。

### cosine_check.py


```python
'''
Author: Wang-nine Wang-nine@users.noreply.github.com
Date: 2026-11-11 11:55:02
LastEditors: Wang-nine Wang-nine@users.noreply.github.com
LastEditTime: 2026-11-11 14:54:22
Description: justing learning!
'''
import numpy as np

def main():
    test_cosine_similarity(np.array([]), np.array([]))
    test_cosine_similarity(np.array([3, 4]), np.array([3]))
    test_cosine_similarity(np.array([[3], [4]]), np.array([3, 4]))
    test_cosine_similarity(np.array([0, 0]), np.array([3, 4]))
    test_l2_norm(np.array([]))
    test_l2_norm(np.array([[3], [4]]))
    test_l2_norm(np.array([0, 0]))
    test_cosine_similarity(np.array([3, 4]), np.array([6, 8]))
    test_cosine_similarity(np.array([3, 4]), np.array([-3, -4]))
    test_cosine_similarity(np.array([1, 0]), np.array([0, 2]))
    test_cosine_similarity(np.array([1, 0]), np.array([1, 1]))
    test_cosine_similarity(np.array([0, 0]), np.array([1, 1]))

def test_l2_norm(x: np.ndarray) -> None:
    try:
        print(f"the l2 norm of x is {l2_norm(x)}")
    except ValueError as e:
        print(e)

def test_cosine_similarity(a: np.ndarray, b: np.ndarray) -> None:
    try:
        print(f"the cosine similarity of {a} and {b} is {cosine_similarity(a, b)}")
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
    elif a.size == 0 or b.size == 0:
        raise ValueError("pls make sure the vector is not empty!")
    elif a.size != b.size:
        raise ValueError("pls check the size of a be have the same size of b!")
    elif np.all(a == 0) or np.all(b == 0):
        raise ValueError("pls make sure that array can not filled with zeros!")
    #calculate the cosine similarity
    return (a @ b) / (l2_norm(a) * l2_norm(b))

if __name__ == "__main__":
    main()
```

*本文于2026-11-12整理公开，日期为导入日期。*
