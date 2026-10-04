/**
 * M0 冻结锚点（一次性）。
 *
 * `demo-trade/model-bundle.json` 是本 Spike 模拟的「项目现有模型」，也是 M0 四个 Spike 的
 * 共同不可变基线。这里登记其 M0 冻结值，仅用于证明「整条 Agent 链路没有改动基线」。
 *
 * 注意：按只读复核清单 §8，该哈希是 **M0 一次性锚点**，M0 关闭后随 bundle 演进作废并须重新登记，
 * 不得当作永久常量。因此本 Spike 的主断言是「链路前后哈希相等」（由被测数据派生、不脆弱），
 * 与之并列再核对本锚点值。
 */

/** demo-trade bundle 相对 testkit fixtures 的路径。 */
export const DEMO_TRADE_BUNDLE_RELATIVE_PATH = 'demo-trade/model-bundle.json';

/** M0 冻结 sha256（十六进制小写）。 */
export const DEMO_TRADE_BUNDLE_SHA256 =
  '1a54c6e3158fb2d7a079fad244e30fd774c6b453e06d3859785978a184e03c62';

/** M0 冻结字节数。 */
export const DEMO_TRADE_BUNDLE_BYTES = 27549;
