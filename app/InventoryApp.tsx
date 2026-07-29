"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Role = "admin" | "operator" | "finance";
type Row = Record<string, string | number | null | undefined>;
type Actor = { email: string; displayName: string; role: Role };
type Reference = {
  id: number;
  code: string;
  name: string;
  storeName?: string;
  site?: string;
  contact?: string;
};
type AppData = {
  actor: Actor;
  references: {
    companies: Reference[];
    factories: Reference[];
    suppliers: Reference[];
  };
  skus: Row[];
  inventory: Row[];
  inbounds: Row[];
  outbounds: Row[];
  allocations: Row[];
  ledger: Row[];
  sales: Row[];
  expenses: Row[];
  users: Row[];
  dashboard: Row;
};
type MasterImportPackage = {
  packageKey: string;
  sourceFile: string;
  preparedAt: string;
  factories: Array<{ code: string; name: string }>;
  skus: Array<{
    internalSku: string;
    name: string;
    category?: string;
    purchaseUnit?: string;
    safetyStock?: number;
  }>;
  inventoryCommitBlocked?: boolean;
  blockReason?: string;
};
type MasterImportPreview = {
  valid: boolean;
  packageKey: string;
  sourceFile: string;
  preparedAt: string;
  factories: { total: number; existing: number; new: number };
  skus: { total: number; existing: number; new: number };
  inventory: {
    willWriteQuantity: boolean;
    blocked: boolean;
    reason: string;
  };
  runStatus: "not_started" | "pending" | "committed" | "rolled_back";
};

const NAV = [
  ["经营", ["经营看板", "批次库存", "入库管理", "出库 / 报关", "FBA / FBM库存"]],
  ["财务", ["销售与结算", "利润中心"]],
  ["资料与工具", ["商品管理", "工厂 / 供应商", "报表导出", "数据导入", "用户与设置"]],
] as const;

const NODE_NAMES = ["国内仓可用", "运输中", "FBA接收中", "FBA可售"];
const ROLE_LABEL: Record<Role, string> = {
  admin: "管理员",
  operator: "库存操作员",
  finance: "财务",
};

export function InventoryApp() {
  const [active, setActive] = useState("经营看板");
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await readBootstrap());
    } catch (error) {
      setNotice({ kind: "error", text: messageOf(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let current = true;
    readBootstrap()
      .then((result) => {
        if (current) setData(result);
      })
      .catch((error) => {
        if (current) setNotice({ kind: "error", text: messageOf(error) });
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  async function submit(path: string, payload: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败");
      setNotice({ kind: "ok", text: result.message || "已保存。" });
      await refresh();
      return true;
    } catch (error) {
      setNotice({ kind: "error", text: messageOf(error) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">FIFO</div>
        <p>正在打开经营管理台…</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">!</div>
        <h1>暂时无法读取数据</h1>
        <p>{notice?.text || "请刷新页面重试。"}</p>
        <button className="button primary" onClick={() => location.reload()}>
          重新加载
        </button>
      </main>
    );
  }

  const canStockWrite =
    data.actor.role === "admin" || data.actor.role === "operator";
  const canFinanceWrite =
    data.actor.role === "admin" || data.actor.role === "finance";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">FIFO</div>
          <div>
            <strong>批次进销存</strong>
            <span>Amazon 经营管理台</span>
          </div>
        </div>
        <nav>
          {NAV.map(([group, items]) => (
            <div className="nav-group" key={group}>
              <p>{group}</p>
              {items.map((item) => (
                <button
                  key={item}
                  className={active === item ? "active" : ""}
                  onClick={() => {
                    setActive(item);
                    setSidebarOpen(false);
                  }}
                >
                  <span className="nav-index">
                    {String(
                      NAV.flatMap(([, list]) => list).indexOf(item) + 1,
                    ).padStart(2, "0")}
                  </span>
                  {item}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="account">
          <span className="avatar">{data.actor.displayName.slice(0, 1)}</span>
          <div>
            <strong>{data.actor.displayName}</strong>
            <span>
              {ROLE_LABEL[data.actor.role]} · {data.actor.email}
            </span>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            ☰
          </button>
          <div className="breadcrumb">
            Amazon 经营台 <span>/</span> <strong>{active}</strong>
          </div>
          <div className="top-actions">
            <span className="live-dot">数据实时保存</span>
            <button className="icon-button" title="刷新数据" onClick={refresh}>
              ↻
            </button>
          </div>
        </header>
        <main className="workspace">
          {notice && (
            <div className={`notice ${notice.kind}`}>
              {notice.text}
              <button onClick={() => setNotice(null)}>×</button>
            </div>
          )}
          <Page
            name={active}
            data={data}
            busy={busy}
            submit={submit}
            canStockWrite={canStockWrite}
            canFinanceWrite={canFinanceWrite}
          />
        </main>
      </div>
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="关闭菜单"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

function Page(props: PageProps & { name: string }) {
  const { name } = props;
  if (name === "经营看板") return <Dashboard data={props.data} />;
  if (name === "批次库存") return <BatchInventory data={props.data} />;
  if (name === "入库管理") return <InboundPage {...props} />;
  if (name === "出库 / 报关") return <OutboundPage {...props} />;
  if (name === "FBA / FBM库存") return <NodeInventory {...props} />;
  if (name === "销售与结算") return <SalesPage {...props} />;
  if (name === "利润中心") return <ProfitPage data={props.data} />;
  if (name === "商品管理") return <SkuPage {...props} />;
  if (name === "工厂 / 供应商") return <PartnerPage {...props} />;
  if (name === "报表导出") return <ExportPage data={props.data} />;
  if (name === "数据导入") return <ImportPage {...props} />;
  return <UsersPage {...props} />;
}

function Dashboard({ data }: { data: AppData }) {
  const d = data.dashboard;
  const stockTotal = n(d.totalInventory);
  const nodeCards = [
    ["国内仓可用", n(d.domesticAvailable)],
    ["运输中", n(d.inTransit)],
    ["FBA接收中", n(d.fbaReceiving)],
    ["FBA可售", n(d.fbaSellable)],
  ] as const;
  const lowStock = data.skus.filter((sku) => {
    const qty = data.inventory
      .filter((row) => n(row.skuId) === n(sku.id))
      .reduce((sum, row) => sum + n(row.totalRemaining), 0);
    return qty <= n(sku.safetyStock);
  });
  return (
    <>
      <PageTitle
        title="经营看板"
        subtitle="共享库存、销售与利润的统一经营口径"
        actions={
          <a className="button primary" href="/api/export">
            导出当前数据
          </a>
        }
      />
      <section className="metric-grid">
        <Metric
          label="当前总库存"
          value={formatNumber(stockTotal)}
          note={`${n(d.skuInStock)} 个有库存SKU`}
        />
        <Metric
          label="库存货值"
          value={money(d.inventoryValueFen)}
          note="按批次 FIFO 采购成本"
        />
        <Metric
          label="累计销售件数"
          value={formatNumber(n(d.unitsSold))}
          note="已录入的亚马逊净销售"
        />
        <Metric
          label="净销售收入"
          value={money(d.netRevenueFen)}
          note={`销售额 ${money(d.grossRevenueFen)}`}
        />
        <Metric
          label="FIFO销售成本"
          value={money(d.fifoCostFen)}
          note="按实际批次消耗"
        />
        <Metric
          label="其他经营费用"
          value={money(d.otherExpensesFen)}
          note="财务录入费用"
        />
        <Metric
          label="经营利润"
          value={money(d.profitFen)}
          note="净收入 - 成本 - 费用"
          tone={n(d.profitFen) >= 0 ? "green" : "red"}
        />
        <Metric
          label="在库SKU"
          value={formatNumber(n(d.skuInStock))}
          note={`${lowStock.length} 个低于安全库存`}
        />
      </section>
      <section className="dashboard-grid">
        <Card
          title="库存节点分布"
          subtitle={`当前共 ${formatNumber(stockTotal)} 件`}
        >
          <div className="node-bars">
            {nodeCards.map(([label, qty]) => {
              const width = stockTotal
                ? Math.max(2, (qty / stockTotal) * 100)
                : 0;
              return (
                <div className="node-row" key={label}>
                  <span>{label}</span>
                  <div>
                    <i style={{ width: `${width}%` }} />
                  </div>
                  <strong>{formatNumber(qty)}</strong>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="待关注事项" subtitle="根据当前数据自动判断">
          <div className="attention-list">
            <div>
              <span className="status warning">库存预警</span>
              <p>
                {lowStock.length
                  ? `${lowStock.length} 个 SKU 已低于或等于安全库存`
                  : "当前没有低库存 SKU"}
              </p>
            </div>
            <div>
              <span className="status neutral">在途跟进</span>
              <p>
                {n(d.inTransit)
                  ? `${formatNumber(n(d.inTransit))} 件正在运输中`
                  : "暂无运输中库存"}
              </p>
            </div>
            <div>
              <span className="status neutral">接收核对</span>
              <p>
                {n(d.fbaReceiving)
                  ? `${formatNumber(n(d.fbaReceiving))} 件等待 FBA 接收`
                  : "暂无待接收库存"}
              </p>
            </div>
          </div>
        </Card>
      </section>
      <Card
        title="最近库存变动"
        subtitle="每次入库、出库、节点转移和销售都会留下记录"
      >
        <DataTable
          rows={data.ledger.slice(0, 8)}
          columns={[
            ["occurredAt", "时间"],
            ["internalSku", "SKU"],
            ["batchNo", "批次"],
            ["factoryName", "工厂"],
            ["node", "库存节点"],
            ["eventType", "动作"],
            ["quantityDelta", "数量变动"],
            ["balanceAfter", "变动后结余"],
          ]}
          empty="完成第一笔入库后，这里会显示库存流水。"
        />
      </Card>
    </>
  );
}

function BatchInventory({ data }: { data: AppData }) {
  const [keyword, setKeyword] = useState("");
  const [factory, setFactory] = useState("");
  const rows = useMemo(
    () =>
      data.inventory.filter((row) => {
        const target =
          `${row.internalSku} ${row.skuName} ${row.batchNo}`.toLowerCase();
        return (
          target.includes(keyword.toLowerCase()) &&
          (!factory || row.factoryName === factory)
        );
      }),
    [data.inventory, keyword, factory],
  );
  return (
    <>
      <PageTitle
        title="批次库存"
        subtitle="查看每个工厂、每个入库日期、每个SKU还剩多少"
        actions={
          <a className="button primary" href="/api/export">
            导出库存表
          </a>
        }
      />
      <div className="filterbar">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索批次、SKU或商品名称"
        />
        <select
          value={factory}
          onChange={(event) => setFactory(event.target.value)}
        >
          <option value="">全部工厂</option>
          {data.references.factories.map((item) => (
            <option key={item.id}>{item.name}</option>
          ))}
        </select>
        <span className="result-count">共 {rows.length} 条批次明细</span>
      </div>
      <Card
        title="批次余额明细"
        subtitle="国内仓为三家公司共用；出库时才指定业务公司"
      >
        <DataTable
          rows={rows}
          columns={[
            ["batchNo", "入库批次"],
            ["inboundDate", "入库日期"],
            ["factoryName", "工厂"],
            ["supplierName", "供应商"],
            ["internalSku", "SKU"],
            ["skuName", "商品名称"],
            ["inboundQuantity", "原始入库"],
            ["domesticAvailable", "国内可用"],
            ["inTransit", "运输中"],
            ["fbaReceiving", "FBA接收中"],
            ["fbaSellable", "FBA可售"],
            ["totalRemaining", "合计剩余"],
          ]}
          empty="还没有批次库存，请先到“商品管理”创建SKU，再录入入库单。"
        />
      </Card>
    </>
  );
}

function InboundPage({ data, submit, busy, canStockWrite }: PageProps) {
  const [form, setForm] = useState({
    batchNo: `RK-${compactDate()}-001`,
    inboundDate: today(),
    factoryId: "",
    supplierId: "",
    skuId: "",
    quantity: "",
    unitCost: "",
    referenceNo: "",
    customsMode: "一般贸易",
    notes: "",
  });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await submit("/api/inbounds", form)) {
      setForm({
        ...form,
        batchNo: `RK-${compactDate()}-${String(
          data.inbounds.length + 2,
        ).padStart(3, "0")}`,
        quantity: "",
        unitCost: "",
        referenceNo: "",
        notes: "",
      });
    }
  }
  return (
    <>
      <PageTitle
        title="入库管理"
        subtitle="按工厂、供应商、日期和SKU建立独立成本批次"
      />
      {!canStockWrite && <ReadOnly role={data.actor.role} />}
      {canStockWrite && (
        <Card
          title="新建入库"
          subtitle="确认后立即增加国内仓可用库存，并生成库存流水"
        >
          <form className="form-grid" onSubmit={save}>
            <Field label="入库批次号 *">
              <input
                required
                value={form.batchNo}
                onChange={(event) =>
                  setForm({ ...form, batchNo: event.target.value })
                }
              />
            </Field>
            <Field label="入库日期 *">
              <input
                required
                type="date"
                value={form.inboundDate}
                onChange={(event) =>
                  setForm({ ...form, inboundDate: event.target.value })
                }
              />
            </Field>
            <Field label="工厂 *">
              <SelectRef
                required
                value={form.factoryId}
                rows={data.references.factories}
                onChange={(value) => setForm({ ...form, factoryId: value })}
              />
            </Field>
            <Field label="供应商 *">
              <SelectRef
                required
                value={form.supplierId}
                rows={data.references.suppliers}
                onChange={(value) => setForm({ ...form, supplierId: value })}
              />
            </Field>
            <Field label="SKU *">
              <SelectSku
                required
                value={form.skuId}
                rows={data.skus}
                onChange={(value) => setForm({ ...form, skuId: value })}
              />
            </Field>
            <Field label="入库数量 *">
              <input
                required
                min="1"
                type="number"
                value={form.quantity}
                onChange={(event) =>
                  setForm({ ...form, quantity: event.target.value })
                }
              />
            </Field>
            <Field label="采购单价（元）">
              <input
                min="0"
                step="0.01"
                type="number"
                value={form.unitCost}
                onChange={(event) =>
                  setForm({ ...form, unitCost: event.target.value })
                }
              />
            </Field>
            <Field label="报关 / 采购参考号">
              <input
                value={form.referenceNo}
                onChange={(event) =>
                  setForm({ ...form, referenceNo: event.target.value })
                }
              />
            </Field>
            <Field label="贸易方式">
              <input
                value={form.customsMode}
                onChange={(event) =>
                  setForm({ ...form, customsMode: event.target.value })
                }
              />
            </Field>
            <Field label="备注" wide>
              <input
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
            </Field>
            <div className="form-actions">
              <button
                className="button primary"
                disabled={busy || !data.skus.length}
              >
                {busy ? "正在保存…" : "确认入库"}
              </button>
              {!data.skus.length && <span>请先创建SKU</span>}
            </div>
          </form>
        </Card>
      )}
      <Card
        title="已确认入库单"
        subtitle="同一批次的后续库存消耗会按FIFO追踪"
      >
        <DataTable
          rows={data.inbounds}
          columns={[
            ["batchNo", "批次号"],
            ["inboundDate", "日期"],
            ["factoryName", "工厂"],
            ["supplierName", "供应商"],
            ["skuCount", "SKU数"],
            ["totalQuantity", "总数量"],
            ["totalCostFen", "采购总额", "money"],
            ["referenceNo", "参考号"],
            ["createdBy", "录入人"],
          ]}
          empty="暂无入库记录。"
        />
      </Card>
    </>
  );
}

function OutboundPage({ data, submit, busy, canStockWrite }: PageProps) {
  const [form, setForm] = useState({
    orderNo: `CK-${compactDate()}-001`,
    outboundDate: today(),
    targetCompanyId: "",
    destinationNode: "运输中",
    skuId: "",
    quantity: "",
    notes: "",
  });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await submit("/api/outbounds", form)) {
      setForm({
        ...form,
        orderNo: `CK-${compactDate()}-${String(
          data.outbounds.length + 2,
        ).padStart(3, "0")}`,
        quantity: "",
        notes: "",
      });
    }
  }
  return (
    <>
      <PageTitle
        title="出库 / 报关"
        subtitle="出库时指定业务公司；系统自动按最早入库批次FIFO扣减"
      />
      {!canStockWrite && <ReadOnly role={data.actor.role} />}
      {canStockWrite && (
        <Card
          title="新建出库单"
          subtitle="一张单可自动调用A工厂、B工厂不同日期的同一SKU库存"
        >
          <form className="form-grid" onSubmit={save}>
            <Field label="出库 / 报关单号 *">
              <input
                required
                value={form.orderNo}
                onChange={(event) =>
                  setForm({ ...form, orderNo: event.target.value })
                }
              />
            </Field>
            <Field label="出库日期 *">
              <input
                required
                type="date"
                value={form.outboundDate}
                onChange={(event) =>
                  setForm({ ...form, outboundDate: event.target.value })
                }
              />
            </Field>
            <Field label="所属公司 *">
              <SelectRef
                required
                value={form.targetCompanyId}
                rows={data.references.companies}
                onChange={(value) =>
                  setForm({ ...form, targetCompanyId: value })
                }
              />
            </Field>
            <Field label="到达节点 *">
              <select
                value={form.destinationNode}
                onChange={(event) =>
                  setForm({ ...form, destinationNode: event.target.value })
                }
              >
                <option>运输中</option>
                <option>FBA接收中</option>
                <option>FBA可售</option>
              </select>
            </Field>
            <Field label="SKU *">
              <SelectSku
                required
                value={form.skuId}
                rows={data.skus}
                onChange={(value) => setForm({ ...form, skuId: value })}
              />
            </Field>
            <Field label="出库数量 *">
              <input
                required
                min="1"
                type="number"
                value={form.quantity}
                onChange={(event) =>
                  setForm({ ...form, quantity: event.target.value })
                }
              />
            </Field>
            <Field label="备注" wide>
              <input
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
                placeholder="例如：报关单、货代、柜号"
              />
            </Field>
            <div className="form-actions">
              <button className="button primary" disabled={busy}>
                {busy ? "正在按FIFO分配…" : "确认出库"}
              </button>
            </div>
          </form>
        </Card>
      )}
      <Card
        title="出库记录"
        subtitle="出库后的批次来源可在下方FIFO分配表核对"
      >
        <DataTable
          rows={data.outbounds}
          columns={[
            ["orderNo", "出库单号"],
            ["outboundDate", "日期"],
            ["companyName", "公司"],
            ["internalSku", "SKU"],
            ["skuName", "商品名称"],
            ["quantity", "数量"],
            ["destinationNode", "去向"],
            ["createdBy", "操作人"],
          ]}
          empty="暂无出库记录。"
        />
      </Card>
      <Card
        title="FIFO批次分配"
        subtitle="清楚显示每张出库单消耗了哪个工厂、哪个入库批次"
      >
        <DataTable
          rows={data.allocations}
          columns={[
            ["orderNo", "出库单号"],
            ["internalSku", "SKU"],
            ["batchNo", "消耗批次"],
            ["factoryName", "来源工厂"],
            ["quantity", "消耗数量"],
            ["unitCostFen", "批次单价", "money"],
            ["overrideReason", "调整说明"],
          ]}
          empty="完成出库后，这里会显示自动分配结果。"
        />
      </Card>
    </>
  );
}

function NodeInventory({ data, submit, busy, canStockWrite }: PageProps) {
  const [form, setForm] = useState({
    inboundItemId: "",
    fromNode: "运输中",
    toNode: "FBA接收中",
    quantity: "",
    occurredAt: today(),
    note: "",
  });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await submit("/api/transfers", form)) {
      setForm({ ...form, quantity: "", note: "" });
    }
  }
  return (
    <>
      <PageTitle
        title="FBA / FBM库存"
        subtitle="按实际物流进度，把同一批次库存从一个节点转入另一个节点"
      />
      {!canStockWrite && <ReadOnly role={data.actor.role} />}
      {canStockWrite && (
        <Card
          title="库存节点转移"
          subtitle="例如：运输中 → FBA接收中 → FBA可售"
        >
          <form className="form-grid" onSubmit={save}>
            <Field label="批次 / SKU *">
              <select
                required
                value={form.inboundItemId}
                onChange={(event) =>
                  setForm({ ...form, inboundItemId: event.target.value })
                }
              >
                <option value="">请选择</option>
                {data.inventory.map((row) => (
                  <option
                    key={String(row.inboundItemId)}
                    value={String(row.inboundItemId)}
                  >
                    {row.batchNo} · {row.internalSku} · {row.factoryName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="转出节点 *">
              <select
                value={form.fromNode}
                onChange={(event) =>
                  setForm({ ...form, fromNode: event.target.value })
                }
              >
                {NODE_NAMES.map((node) => (
                  <option key={node}>{node}</option>
                ))}
              </select>
            </Field>
            <Field label="转入节点 *">
              <select
                value={form.toNode}
                onChange={(event) =>
                  setForm({ ...form, toNode: event.target.value })
                }
              >
                {NODE_NAMES.map((node) => (
                  <option key={node}>{node}</option>
                ))}
              </select>
            </Field>
            <Field label="数量 *">
              <input
                required
                min="1"
                type="number"
                value={form.quantity}
                onChange={(event) =>
                  setForm({ ...form, quantity: event.target.value })
                }
              />
            </Field>
            <Field label="发生日期 *">
              <input
                required
                type="date"
                value={form.occurredAt}
                onChange={(event) =>
                  setForm({ ...form, occurredAt: event.target.value })
                }
              />
            </Field>
            <Field label="备注">
              <input
                value={form.note}
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
              />
            </Field>
            <div className="form-actions">
              <button
                className="button primary"
                disabled={busy || form.fromNode === form.toNode}
              >
                {busy ? "正在转移…" : "确认节点转移"}
              </button>
            </div>
          </form>
        </Card>
      )}
      <Card
        title="节点库存明细"
        subtitle="每一行都保留原始入库批次与工厂归属"
      >
        <DataTable
          rows={data.inventory}
          columns={[
            ["batchNo", "批次"],
            ["factoryName", "工厂"],
            ["internalSku", "SKU"],
            ["skuName", "商品"],
            ["domesticAvailable", "国内可用"],
            ["inTransit", "运输中"],
            ["fbaReceiving", "FBA接收中"],
            ["fbaSellable", "FBA可售"],
            ["totalRemaining", "合计"],
          ]}
          empty="暂无节点库存。"
        />
      </Card>
    </>
  );
}

function SalesPage({ data, submit, busy, canFinanceWrite }: PageProps) {
  const [form, setForm] = useState({
    companyId: "",
    skuId: "",
    saleDate: today(),
    quantity: "",
    grossRevenue: "",
    fees: "",
    netRevenue: "",
    referenceNo: "",
  });
  const [expense, setExpense] = useState({
    companyId: "",
    incurredDate: today(),
    category: "",
    amount: "",
    notes: "",
  });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await submit("/api/sales", form)) {
      setForm({
        ...form,
        quantity: "",
        grossRevenue: "",
        fees: "",
        netRevenue: "",
        referenceNo: "",
      });
    }
  }
  async function saveExpense(event: FormEvent) {
    event.preventDefault();
    if (await submit("/api/expenses", expense)) {
      setExpense({ ...expense, category: "", amount: "", notes: "" });
    }
  }
  return (
    <>
      <PageTitle
        title="销售与结算"
        subtitle="录入亚马逊净销售，系统从FBA可售库存按FIFO结转成本"
      />
      {!canFinanceWrite && (
        <ReadOnly
          role={data.actor.role}
          text="库存操作员可以查看全部销售和利润信息，但销售金额由管理员或财务录入。"
        />
      )}
      {canFinanceWrite && (
        <Card
          title="录入销售记录"
          subtitle="第一版支持汇总录入；后续可接亚马逊结算报表批量导入"
        >
          <form className="form-grid" onSubmit={save}>
            <Field label="公司 / 店铺 *">
              <SelectRef
                required
                value={form.companyId}
                rows={data.references.companies}
                onChange={(value) => setForm({ ...form, companyId: value })}
              />
            </Field>
            <Field label="SKU *">
              <SelectSku
                required
                value={form.skuId}
                rows={data.skus}
                onChange={(value) => setForm({ ...form, skuId: value })}
              />
            </Field>
            <Field label="销售日期 *">
              <input
                required
                type="date"
                value={form.saleDate}
                onChange={(event) =>
                  setForm({ ...form, saleDate: event.target.value })
                }
              />
            </Field>
            <Field label="销售数量 *">
              <input
                required
                min="1"
                type="number"
                value={form.quantity}
                onChange={(event) =>
                  setForm({ ...form, quantity: event.target.value })
                }
              />
            </Field>
            <Field label="商品销售额（元）">
              <input
                min="0"
                step="0.01"
                type="number"
                value={form.grossRevenue}
                onChange={(event) =>
                  setForm({ ...form, grossRevenue: event.target.value })
                }
              />
            </Field>
            <Field label="亚马逊费用（元）">
              <input
                min="0"
                step="0.01"
                type="number"
                value={form.fees}
                onChange={(event) =>
                  setForm({ ...form, fees: event.target.value })
                }
              />
            </Field>
            <Field label="净回款口径收入（元）*">
              <input
                required
                min="0"
                step="0.01"
                type="number"
                value={form.netRevenue}
                onChange={(event) =>
                  setForm({ ...form, netRevenue: event.target.value })
                }
              />
            </Field>
            <Field label="结算单 / 订单参考号 *">
              <input
                required
                value={form.referenceNo}
                onChange={(event) =>
                  setForm({ ...form, referenceNo: event.target.value })
                }
              />
            </Field>
            <div className="form-actions">
              <button className="button primary" disabled={busy}>
                {busy ? "正在结转成本…" : "保存销售记录"}
              </button>
            </div>
          </form>
        </Card>
      )}
      <Card
        title="销售与成本记录"
        subtitle="利润 = 净收入 - FIFO成本；其他费用在利润中心汇总扣除"
      >
        <DataTable
          rows={data.sales}
          columns={[
            ["saleDate", "日期"],
            ["companyName", "公司"],
            ["internalSku", "SKU"],
            ["quantity", "销量"],
            ["grossRevenueFen", "商品销售额", "money"],
            ["feesFen", "亚马逊费用", "money"],
            ["netRevenueFen", "净收入", "money"],
            ["fifoCostFen", "FIFO成本", "money"],
            ["profit", "销售毛利", "computedProfit"],
            ["referenceNo", "参考号"],
          ]}
          empty="暂无销售记录。"
        />
      </Card>
      {canFinanceWrite && (
        <Card title="录入其他经营费用" subtitle="例如广告、头程、仓储和服务费">
          <form className="form-grid" onSubmit={saveExpense}>
            <Field label="公司 *">
              <SelectRef
                required
                value={expense.companyId}
                rows={data.references.companies}
                onChange={(value) =>
                  setExpense({ ...expense, companyId: value })
                }
              />
            </Field>
            <Field label="发生日期 *">
              <input
                required
                type="date"
                value={expense.incurredDate}
                onChange={(event) =>
                  setExpense({
                    ...expense,
                    incurredDate: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="费用类别 *">
              <input
                required
                value={expense.category}
                onChange={(event) =>
                  setExpense({ ...expense, category: event.target.value })
                }
                placeholder="例如：广告费"
              />
            </Field>
            <Field label="金额（元）*">
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                value={expense.amount}
                onChange={(event) =>
                  setExpense({ ...expense, amount: event.target.value })
                }
              />
            </Field>
            <Field label="备注" wide>
              <input
                value={expense.notes}
                onChange={(event) =>
                  setExpense({ ...expense, notes: event.target.value })
                }
              />
            </Field>
            <div className="form-actions">
              <button className="button secondary" disabled={busy}>
                {busy ? "正在保存…" : "保存费用"}
              </button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}

function ProfitPage({ data }: { data: AppData }) {
  const d = data.dashboard;
  return (
    <>
      <PageTitle
        title="利润中心"
        subtitle="当前为人民币管理口径：净收入减FIFO采购成本，再减其他经营费用"
        actions={
          <a className="button primary" href="/api/export">
            导出利润明细
          </a>
        }
      />
      <section className="metric-grid compact">
        <Metric
          label="净销售收入"
          value={money(d.netRevenueFen)}
          note="录入销售的净收入合计"
        />
        <Metric
          label="FIFO采购成本"
          value={money(d.fifoCostFen)}
          note="实际售出批次成本"
        />
        <Metric
          label="其他经营费用"
          value={money(d.otherExpensesFen)}
          note="广告、物流等费用"
        />
        <Metric
          label="经营利润"
          value={money(d.profitFen)}
          note="税费与汇兑可后续扩展"
          tone={n(d.profitFen) >= 0 ? "green" : "red"}
        />
      </section>
      <ExpensePanel data={data} />
      <Card title="销售利润明细" subtitle="可回溯到公司、SKU和销售参考号">
        <DataTable
          rows={data.sales}
          columns={[
            ["saleDate", "日期"],
            ["companyName", "公司"],
            ["internalSku", "SKU"],
            ["quantity", "销量"],
            ["netRevenueFen", "净收入", "money"],
            ["fifoCostFen", "FIFO成本", "money"],
            ["profit", "销售毛利", "computedProfit"],
            ["referenceNo", "参考号"],
          ]}
          empty="暂无利润数据。"
        />
      </Card>
    </>
  );
}

function ExpensePanel({ data }: { data: AppData }) {
  return (
    <Card
      title="费用记录"
      subtitle="费用录入入口位于“销售与结算”页面（管理员 / 财务）"
    >
      <DataTable
        rows={data.expenses}
        columns={[
          ["incurredDate", "日期"],
          ["companyName", "公司"],
          ["category", "费用类别"],
          ["amountFen", "金额", "money"],
          ["notes", "备注"],
          ["createdBy", "录入人"],
        ]}
        empty="暂无其他经营费用。"
      />
    </Card>
  );
}

function SkuPage({ data, submit, busy, canStockWrite }: PageProps) {
  const [form, setForm] = useState({
    internalSku: "",
    name: "",
    category: "",
    purchaseUnit: "件",
    safetyStock: "0",
  });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await submit("/api/skus", form)) {
      setForm({
        internalSku: "",
        name: "",
        category: "",
        purchaseUnit: "件",
        safetyStock: "0",
      });
    }
  }
  return (
    <>
      <PageTitle
        title="商品管理"
        subtitle="先建立统一SKU档案，再进行入库、出库和销售记录"
      />
      {!canStockWrite && <ReadOnly role={data.actor.role} />}
      {canStockWrite && (
        <Card title="新增SKU" subtitle="SKU编号保存后不可重复">
          <form className="form-grid" onSubmit={save}>
            <Field label="SKU编号 *">
              <input
                required
                value={form.internalSku}
                onChange={(event) =>
                  setForm({ ...form, internalSku: event.target.value })
                }
              />
            </Field>
            <Field label="商品名称 *">
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>
            <Field label="分类">
              <input
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
              />
            </Field>
            <Field label="采购单位">
              <input
                value={form.purchaseUnit}
                onChange={(event) =>
                  setForm({ ...form, purchaseUnit: event.target.value })
                }
              />
            </Field>
            <Field label="安全库存">
              <input
                min="0"
                type="number"
                value={form.safetyStock}
                onChange={(event) =>
                  setForm({ ...form, safetyStock: event.target.value })
                }
              />
            </Field>
            <div className="form-actions">
              <button className="button primary" disabled={busy}>
                {busy ? "正在保存…" : "保存SKU"}
              </button>
            </div>
          </form>
        </Card>
      )}
      <Card title="SKU档案" subtitle={`共 ${data.skus.length} 个SKU`}>
        <DataTable
          rows={data.skus}
          columns={[
            ["internalSku", "SKU编号"],
            ["name", "商品名称"],
            ["category", "分类"],
            ["purchaseUnit", "采购单位"],
            ["safetyStock", "安全库存"],
            ["createdAt", "创建时间"],
          ]}
          empty="还没有SKU，请先创建第一件商品。"
        />
      </Card>
    </>
  );
}

function PartnerPage({ data, submit, busy, canStockWrite }: PageProps) {
  const [form, setForm] = useState({
    kind: "factory",
    code: "",
    name: "",
    contact: "",
  });
  const [company, setCompany] = useState(() => {
    const first = data.references.companies[0];
    return {
      id: first ? String(first.id) : "",
      code: first?.code || "",
      name: first?.name || "",
      storeName: first?.storeName || "",
      site: first?.site || "",
    };
  });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await submit("/api/partners", form)) {
      setForm({ ...form, code: "", name: "", contact: "" });
    }
  }
  function chooseCompany(id: string) {
    const selected = data.references.companies.find(
      (item) => String(item.id) === id,
    );
    setCompany({
      id,
      code: selected?.code || "",
      name: selected?.name || "",
      storeName: selected?.storeName || "",
      site: selected?.site || "",
    });
  }
  async function saveCompany(event: FormEvent) {
    event.preventDefault();
    await submit("/api/companies", company);
  }
  return (
    <>
      <PageTitle
        title="工厂 / 供应商"
        subtitle="工厂用于区分生产来源，供应商用于记录采购往来；二者分开管理"
      />
      {!canStockWrite && <ReadOnly role={data.actor.role} />}
      {canStockWrite && (
        <Card
          title="新增合作方"
          subtitle="新增后会立即出现在入库单下拉选项中"
        >
          <form className="form-grid" onSubmit={save}>
            <Field label="类型">
              <select
                value={form.kind}
                onChange={(event) =>
                  setForm({ ...form, kind: event.target.value })
                }
              >
                <option value="factory">工厂</option>
                <option value="supplier">供应商</option>
              </select>
            </Field>
            <Field label="内部编码 *">
              <input
                required
                value={form.code}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value })
                }
                placeholder="例如 FACTORY-C"
              />
            </Field>
            <Field label="名称 *">
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>
            <Field label="联系人 / 备注">
              <input
                value={form.contact}
                onChange={(event) =>
                  setForm({ ...form, contact: event.target.value })
                }
              />
            </Field>
            <div className="form-actions">
              <button className="button primary" disabled={busy}>
                {busy ? "正在保存…" : "保存合作方"}
              </button>
            </div>
          </form>
        </Card>
      )}
      {data.actor.role === "admin" && (
        <Card
          title="公司与店铺"
          subtitle="三家公司共用国内库存，出库和销售时按这里的公司口径归属"
        >
          <form className="form-grid" onSubmit={saveCompany}>
            <Field label="选择公司 *">
              <select
                required
                value={company.id}
                onChange={(event) => chooseCompany(event.target.value)}
              >
                {data.references.companies.map((item) => (
                  <option value={String(item.id)} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="公司编码 *">
              <input
                required
                value={company.code}
                onChange={(event) =>
                  setCompany({ ...company, code: event.target.value })
                }
              />
            </Field>
            <Field label="公司名称 *">
              <input
                required
                value={company.name}
                onChange={(event) =>
                  setCompany({ ...company, name: event.target.value })
                }
              />
            </Field>
            <Field label="亚马逊店铺名">
              <input
                value={company.storeName}
                onChange={(event) =>
                  setCompany({ ...company, storeName: event.target.value })
                }
              />
            </Field>
            <Field label="站点">
              <input
                value={company.site}
                onChange={(event) =>
                  setCompany({ ...company, site: event.target.value })
                }
                placeholder="例如 US"
              />
            </Field>
            <div className="form-actions">
              <button className="button secondary" disabled={busy}>
                {busy ? "正在保存…" : "更新公司信息"}
              </button>
            </div>
          </form>
        </Card>
      )}
      <div className="two-column">
        <Card title="工厂档案" subtitle="每个入库批次必须选择一个工厂">
          <DataTable
            rows={data.references.factories}
            columns={[
              ["code", "编码"],
              ["name", "工厂名称"],
              ["contact", "联系人 / 备注"],
            ]}
            empty="暂无工厂。"
          />
        </Card>
        <Card title="供应商档案" subtitle="供应商与工厂独立维护">
          <DataTable
            rows={data.references.suppliers}
            columns={[
              ["code", "编码"],
              ["name", "供应商名称"],
              ["contact", "联系人 / 备注"],
            ]}
            empty="暂无供应商。"
          />
        </Card>
      </div>
    </>
  );
}

function ExportPage({ data }: { data: AppData }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today());
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  return (
    <>
      <PageTitle
        title="报表导出"
        subtitle="导出为真正的Excel工作簿，可直接交给同事筛选、统计和汇报"
      />
      <Card
        title="选择导出期间"
        subtitle="库存余额为当前实时余额；业务明细按发生日期筛选"
      >
        <div className="export-panel">
          <Field label="开始日期">
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>
          <Field label="结束日期">
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
          <a
            className="button primary large"
            href={`/api/export?${query.toString()}`}
          >
            下载经营数据.xlsx
          </a>
        </div>
      </Card>
      <section className="export-cards">
        {[
          [
            "批次库存余额",
            `${data.inventory.length} 行`,
            "批次、工厂、供应商、SKU、各节点余额",
          ],
          [
            "入库与出库",
            `${data.inbounds.length + data.allocations.length} 行`,
            "入库单、FIFO分配、成本与来源批次",
          ],
          [
            "库存流水",
            `${data.ledger.length} 行`,
            "每次库存变化、操作人、变化前后依据",
          ],
          [
            "销售与利润",
            `${data.sales.length + data.expenses.length} 行`,
            "销售、净收入、FIFO成本和费用",
          ],
        ].map(([title, count, text]) => (
          <article key={title}>
            <span>Excel工作表</span>
            <h3>{title}</h3>
            <strong>{count}</strong>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <Card
        title="空白录入模板"
        subtitle="后续整理历史数据时，先按模板列名填写；批量导入功能将在下一版接入"
      >
        <a className="button secondary" href="/api/export?mode=template">
          下载数据整理模板.xlsx
        </a>
      </Card>
    </>
  );
}

function ImportPage({ data, busy, submit }: PageProps) {
  const [selectedFile, setSelectedFile] = useState("");
  const [masterPackage, setMasterPackage] =
    useState<MasterImportPackage | null>(null);
  const [preview, setPreview] = useState<MasterImportPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [localNotice, setLocalNotice] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  async function requestPreview(dataPackage: MasterImportPackage) {
    const response = await fetch("/api/import/master", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...dataPackage, action: "preview" }),
    });
    const result = (await response.json()) as MasterImportPreview & {
      error?: string;
    };
    if (!response.ok) throw new Error(result.error || "导入包校验失败");
    setPreview(result);
    return result;
  }

  async function choosePackage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setLocalNotice(null);
    setPreview(null);
    setMasterPackage(null);
    setSelectedFile(file?.name || "");
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setLocalNotice({ kind: "error", text: "导入包不能超过2MB。" });
      return;
    }

    setChecking(true);
    try {
      const parsed = JSON.parse(await file.text()) as MasterImportPackage;
      if (!Array.isArray(parsed.factories) || !Array.isArray(parsed.skus)) {
        throw new Error("文件不是系统生成的主数据导入包。");
      }
      setMasterPackage(parsed);
      const result = await requestPreview(parsed);
      setLocalNotice({
        kind: "ok",
        text:
          result.runStatus === "committed"
            ? "这份导入包已经写入过，系统不会重复导入。"
            : "校验通过，请核对下方数量后再确认写入。",
      });
    } catch (error) {
      setLocalNotice({ kind: "error", text: messageOf(error) });
    } finally {
      setChecking(false);
    }
  }

  async function commitPackage() {
    if (!masterPackage) return;
    const saved = await submit("/api/import/master", {
      ...masterPackage,
      action: "commit",
    });
    if (!saved) return;
    try {
      await requestPreview(masterPackage);
    } catch {
      setPreview((current) =>
        current ? { ...current, runStatus: "committed" } : current,
      );
    }
  }

  const canCommit =
    data.actor.role === "admin" || data.actor.role === "operator";
  const newCount = (preview?.factories.new || 0) + (preview?.skus.new || 0);

  return (
    <>
      <PageTitle
        title="数据导入"
        subtitle="上传系统生成的主数据包，先预览去重，再确认写入；不会改变库存数量"
      />
      <Card
        title="主数据导入"
        subtitle="当前支持工厂和SKU；期初库存、销售与费用仍需口径确认后另行导入"
      >
        <div className="import-upload">
          <label className="file-picker">
            <span>选择主数据导入包（JSON）</span>
            <input
              type="file"
              accept=".json,application/json"
              disabled={checking || busy}
              onChange={choosePackage}
            />
            <strong>{selectedFile || "尚未选择文件"}</strong>
          </label>
          <div className="inline-actions">
            <a className="button secondary" href="/api/export?mode=template">
              下载空白整理模板.xlsx
            </a>
            <span>
              {checking
                ? "正在检查字段、重复数据和历史导入记录…"
                : "系统会按工厂编码和SKU编号自动去重。"}
            </span>
          </div>
        </div>
      </Card>
      {localNotice && (
        <div className={`notice ${localNotice.kind}`}>
          {localNotice.text}
          <button onClick={() => setLocalNotice(null)}>×</button>
        </div>
      )}
      {preview && (
        <>
          <section className="metric-grid compact import-metrics">
            <Metric
              label="工厂档案"
              value={String(preview.factories.total)}
              note={`新增 ${preview.factories.new} · 已存在 ${preview.factories.existing}`}
            />
            <Metric
              label="SKU档案"
              value={String(preview.skus.total)}
              note={`新增 ${preview.skus.new} · 已存在 ${preview.skus.existing}`}
            />
            <Metric
              label="库存数量"
              value="0"
              note="本次明确不写入库存"
            />
            <Metric
              label="导入状态"
              value={
                preview.runStatus === "committed"
                  ? "已完成"
                  : preview.runStatus === "pending"
                    ? "处理中"
                    : "待确认"
              }
              note={`导入包：${preview.packageKey}`}
              tone={preview.runStatus === "committed" ? "green" : undefined}
            />
          </section>
          <Card
            title="确认写入范围"
            subtitle={`来源：${preview.sourceFile}｜整理日期：${preview.preparedAt}`}
          >
            <div className="import-confirm">
              <div className="callout">
                <strong>库存数量为什么仍为0？</strong>
                <p>{preview.inventory.reason}</p>
              </div>
              <div className="inline-actions">
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    !canCommit ||
                    preview.runStatus === "committed" ||
                    newCount === 0
                  }
                  onClick={commitPackage}
                >
                  {preview.runStatus === "committed"
                    ? "这份主数据已写入"
                    : `确认写入 ${newCount} 条新主数据`}
                </button>
                <span>
                  {canCommit
                    ? "只新增尚不存在的工厂和SKU；重复记录自动跳过。"
                    : "财务账号可以预览，但不能写入主数据。"}
                </span>
              </div>
            </div>
          </Card>
        </>
      )}
      {!preview && (
        <div className="callout">
          <strong>正确顺序</strong>
          <p>
            先上传整理包并查看预览，再写入工厂和SKU。待美国、加拿大库存快照日期与站点口径确认后，再导入库存数量和历史销售。
          </p>
        </div>
      )}
    </>
  );
}

function UsersPage({ data, submit, busy }: PageProps) {
  const [form, setForm] = useState({
    email: "",
    displayName: "",
    role: "operator",
  });
  if (data.actor.role !== "admin") {
    return (
      <>
        <PageTitle title="用户与设置" subtitle="当前登录身份与权限范围" />
        <ReadOnly
          role={data.actor.role}
          text="只有管理员可以新增或调整用户；你的业务查看权限不受影响。"
        />
      </>
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await submit("/api/users", form)) {
      setForm({ email: "", displayName: "", role: "operator" });
    }
  }
  return (
    <>
      <PageTitle
        title="用户与设置"
        subtitle="使用同事的登录邮箱分配角色；数据由所有账号共享"
      />
      <Card
        title="新增或调整用户"
        subtitle="相同邮箱再次保存会更新姓名和角色"
      >
        <form className="form-grid" onSubmit={save}>
          <Field label="登录邮箱 *">
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
          </Field>
          <Field label="姓名 *">
            <input
              required
              value={form.displayName}
              onChange={(event) =>
                setForm({ ...form, displayName: event.target.value })
              }
            />
          </Field>
          <Field label="角色 *">
            <select
              value={form.role}
              onChange={(event) =>
                setForm({ ...form, role: event.target.value })
              }
            >
              <option value="admin">管理员</option>
              <option value="operator">库存操作员</option>
              <option value="finance">财务</option>
            </select>
          </Field>
          <div className="form-actions">
            <button className="button primary" disabled={busy}>
              {busy ? "正在保存…" : "保存用户"}
            </button>
          </div>
        </form>
      </Card>
      <Card
        title="用户列表"
        subtitle="库存操作员可查看全部信息，但不能管理用户或录入财务数据"
      >
        <DataTable
          rows={data.users}
          columns={[
            ["displayName", "姓名"],
            ["email", "登录邮箱"],
            ["role", "角色", "role"],
            ["status", "状态"],
            ["createdAt", "创建时间"],
          ]}
          empty="暂无用户。"
        />
      </Card>
      <div className="permission-grid">
        <article>
          <strong>管理员</strong>
          <p>查看全部、录入库存和财务、管理用户与基础资料。</p>
        </article>
        <article>
          <strong>库存操作员</strong>
          <p>查看全部经营与利润信息，录入SKU、入库、出库和库存节点。</p>
        </article>
        <article>
          <strong>财务</strong>
          <p>查看全部，录入销售、回款口径收入和经营费用，下载报表。</p>
        </article>
      </div>
    </>
  );
}

type PageProps = {
  data: AppData;
  busy: boolean;
  submit: (
    path: string,
    payload: Record<string, unknown>,
  ) => Promise<boolean>;
  canStockWrite: boolean;
  canFinanceWrite: boolean;
};

function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <p>批次进销存</p>
        <h1>{title}</h1>
        <span>{subtitle}</span>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <header>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "green" | "red";
}) {
  return (
    <article className={`metric ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function SelectRef({
  rows,
  value,
  onChange,
  required,
}: {
  rows: Reference[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <select
      required={required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">请选择</option>
      {rows.map((item) => (
        <option key={item.id} value={String(item.id)}>
          {item.name}
          {item.storeName ? ` · ${item.storeName}` : ""}
        </option>
      ))}
    </select>
  );
}

function SelectSku({
  rows,
  value,
  onChange,
  required,
}: {
  rows: Row[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <select
      required={required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">请选择SKU</option>
      {rows.map((item) => (
        <option key={String(item.id)} value={String(item.id)}>
          {item.internalSku} · {item.name}
        </option>
      ))}
    </select>
  );
}

function DataTable({
  rows,
  columns,
  empty,
}: {
  rows: Row[];
  columns: (readonly [string, string, string?])[];
  empty: string;
}) {
  if (!rows.length) {
    return (
      <div className="empty-state">
        <span>暂无数据</span>
        <p>{empty}</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(([, label]) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={String(row.id ?? row.inboundItemId ?? rowIndex)}>
              {columns.map(([key, , format]) => (
                <td key={key}>{cell(row, key, format)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadOnly({
  role,
  text,
}: {
  role: Role;
  text?: string;
}) {
  return (
    <div className="callout compact-callout">
      <strong>当前为查看模式</strong>
      <p>
        {text ||
          `${ROLE_LABEL[role]}账号可以查看这些信息，但当前页面的录入由有权限的同事完成。`}
      </p>
    </div>
  );
}

function cell(row: Row, key: string, format?: string): ReactNode {
  if (format === "money") return money(row[key]);
  if (format === "computedProfit") {
    return money(n(row.netRevenueFen) - n(row.fifoCostFen));
  }
  if (format === "role") {
    return ROLE_LABEL[String(row[key]) as Role] || String(row[key] || "—");
  }
  const value = row[key];
  if (key === "quantityDelta") {
    const number = n(value);
    return (
      <span className={number >= 0 ? "positive" : "negative"}>
        {number >= 0 ? "+" : ""}
        {formatNumber(number)}
      </span>
    );
  }
  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}

function n(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function money(fen: unknown): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(n(fen) / 100);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function compactDate(): string {
  return today().replaceAll("-", "");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

async function readBootstrap(): Promise<AppData> {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "读取数据失败");
  return result;
}
