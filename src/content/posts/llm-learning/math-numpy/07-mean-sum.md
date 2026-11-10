---
title: "07 mean 与 sum：归约改变的是哪些量"
published: 2026-10-30
description: "比较 mean 与 sum 下 loss、导数和差商的比例，说明整批样本等比例重复时哪些量改变，以及数值核对的前提。"
image: ''
tags: ["LLM", "NumPy", "数学基础", "reduction", "导数"]
category: "LLM 学习"
draft: false
lang: zh_CN
slug: "llm-math-numpy-07"
---

> M2.4 主，结合 M2.1 reduction。复习提纲，不是掌握证明。

## 1. 同一批误差，两种汇总

```text
w（共享参数）→ 预测 → residual → 每样本平方误差 (N,1)
                                  ├─ sum  → 总 loss   ()
                                  └─ mean → 平均 loss ()
```

$$
r_i = wx_i-y_i, \qquad \ell_i = r_i^2, \qquad
\frac{d\ell_i}{dw} = 2r_i x_i
$$

参数 w 与预测没有因归约而改变；改变的是 loss 及它对 w 的变化率。

## 2. 固定 N 的比例

$$
\begin{aligned}
L_{\mathrm{mean}}(w) &= \frac{L_{\mathrm{sum}}(w)}{N} \\
L_{\mathrm{mean}}'(w) &= \frac{L_{\mathrm{sum}}'(w)}{N} \\
Q_{\mathrm{mean}}(w,h) &= \frac{Q_{\mathrm{sum}}(w,h)}{N}
\end{aligned}
$$

前提：同一批样本，N 不依赖 w；差商使用相同基准 w、相同非零 h。
不是“平均参数”；也不是“导数变化量”。差商是 loss 的区间平均变化率。

## 3. 整批重复一次

| 变化 | sum loss / 导数 / 差商 | mean loss / 导数 / 差商 |
| --- | --- | --- |
| 每个样本出现两次，w、h 不变 | 全部乘 2 | 全部不变 |

理由：总贡献翻倍，样本数也翻倍。mean 的分子、分母抵消；sum 没有除以样本数。
这只针对整批等比例重复，不意味着任意增加新样本后 mean 都不变。

## 4. 检查清单

- w=1 时 residual 恰好为 x-y，但通用计算必须保留 `w*x-y`；用非 1 的参数检查特例掩盖的错误。
- 求导链的 `dp/dw=x`，不再额外乘 w；w 出现在 residual 内部。
- 同一基准、同一归约下比较解析导数与差商，不能跨 mean / sum 混比。
- loss、变化量、差商、点导数是不同的量，即使某次数值恰好相同。
- 数值核对要同时变化参数值和样本数；输出标清 N 与归约方式。

来源：NumPy beginners 的 sum / mean 为本课宣布的主来源，本课未重新抓取；链式法则沿用前课已核对的 OpenStax §3.6。缩放与重复样本的推理为教师课堂补讲及学生练习。

上一课：[06 batch MSE](/posts/llm-math-numpy-06/)。

## 附录：学生代码快照

以下是学生当前已保存的实现，仅供复习；不是教师参考答案，也不是独立掌握证明。原练习文件是唯一编辑源；快照不会自动同步，原文件后续修改后需重新生成。

### mean_sum_check.py


```python
'''
Author: Wang-nine Wang-nine@users.noreply.github.com
Date: 2026-10-30 14:25:13
LastEditors: Wang-nine Wang-nine@users.noreply.github.com
LastEditTime: 2026-10-30 15:44:45
Description: learning...
'''
import numpy as np

def main():
    #p = wx + b(b = 0)
    x = np.array([[1], [2], [3]])
    y = np.array([[4], [1], [1]])
    double_x = np.array([[1], [2], [3], [1], [2], [3]])
    double_y = np.array([[4], [1], [1], [4], [1], [1]])
    w = 2
    offset_array = [0.01, -0.01]
    calc(x, y, w, offset_array, "sum")
    calc(x, y, w, offset_array, "mean")
    calc(double_x, double_y, w, offset_array, "sum")
    calc(double_x, double_y, w, offset_array, "mean")

def calc(x: np.ndarray, y: np.ndarray, w: float, offset_array: list, mode: int):
    sum_loss = np.sum((w * x - y) ** 2)
    #sum_dl_dw = sum_dl_dr * dr_dp * dp_dw = 2r * 1 * x = 2(w * x - y) * x
    sum_dl_dw = np.sum(2 * (w *x - y) * x)
    mean_loss = np.mean((w * x - y) ** 2)
    mean_dl_dw = np.mean(2 * (w * x - y) * x)
    for h in offset_array:
        if mode == "sum":
            #sum mode
            loss_h = np.sum(((w + h) * x - y) ** 2)
            difference_quotient = (loss_h - sum_loss) / h
            dl_dw_h = np.sum(2 * ((w + h) * x - y) * x)
            print(f"规约方式 : 总和 | 基准w : {w} | loss(w) : {sum_loss:.4f} | 解析导数(w) = {sum_dl_dw:.4f} | h : {h} | 差商 : {difference_quotient:.4f}")
        else:
            #mean
            loss_h = np.mean(((w + h) * x - y) ** 2)
            difference_quotient = (loss_h - mean_loss) / h
            dl_dw_h = np.mean(2 * ((w + h) * x - y) * x)
            print(f"规约方式 : 平均 | 基准w : {w} | loss(w) : {mean_loss:.4f} | 解析导数(w) = {mean_dl_dw:.4f} | h : {h} | 差商 : {difference_quotient:.4f}")



if __name__ == "__main__":
    main()
```

*本文于2026-10-30整理公开，日期为导入日期。*
