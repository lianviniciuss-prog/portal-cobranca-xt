import { useState, useEffect } from "react";
import { ref, onValue, update, remove } from "firebase/database";
import { db } from "./firebase.js";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from "recharts";

// ─── Constantes ──────────────────────────────────────────────────────────────
const COBRADORES = ["Gabriela", "Yasmin"];
const DB_PATH = "cobrancas";

// Senha armazenada como hash SHA-256 — nunca em texto puro.
// Para trocar a senha: abra o console do navegador e rode:
// crypto.subtle.digest('SHA-256', new TextEncoder().encode('nova_senha'))
//   .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
const HASH_SENHA_ADMIN = "3b74dda9aa3c46a8ed4d11eaf541373be4d7292306956bb4857ae704425ac2cb";

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function hashSenha(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
}

function gerarId() {
  return crypto.randomUUID();
}

function formatCurrency(val) {
  if (!val && val !== 0) return "—";
  return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function handleValorInput(e, setValorInput) {
  let raw = e.target.value.replace(/[^\d]/g, "");
  if (!raw) { setValorInput(""); return; }
  const num = (parseInt(raw, 10) / 100).toFixed(2);
  setValorInput(num.replace(".", ","));
}

function parseCurrency(str) {
  const val = parseFloat(str.replace(/[^\d,]/g, "").replace(",", "."));
  return isNaN(val) ? "" : val;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PortalCobranca() {
  const [view, setView]               = useState("form");
  const [cobrador, setCobrador]       = useState("");
  const [idBoleto, setIdBoleto]       = useState("");
  const [nomeCliente, setNomeCliente] = useState("");
  const [valorInput, setValorInput]   = useState("");
  const [erro, setErro]               = useState("");
  const [success, setSuccess]         = useState(false);
  const [registros, setRegistros]     = useState([]);   // sempre array ordenado por data desc
  const [carregando, setCarregando]   = useState(true);
  const [salvando, setSalvando]       = useState(false);
  const [filtroNome, setFiltroNome]   = useState("");
  const [busca, setBusca]             = useState("");

  // Admin
  const [adminAutenticado, setAdminAutenticado] = useState(false);
  const [senhaInput, setSenhaInput]             = useState("");
  const [erroSenha, setErroSenha]               = useState("");
  const [autenticando, setAutenticando]         = useState(false);

  // Exclusão
  const [confirmarExclusao, setConfirmarExclusao] = useState(null);

  // ── Listener em tempo real ────────────────────────────────────────────────
  // onValue mantém os dados sincronizados automaticamente.
  // Quando qualquer cobrador registra, todos veem instantaneamente.
  useEffect(() => {
    const dbRef = ref(db, DB_PATH);
    const unsubscribe = onValue(dbRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const lista = Object.values(data).sort(
          (a, b) => new Date(b.registradoEm) - new Date(a.registradoEm)
        );
        setRegistros(lista);
      } else {
        setRegistros([]);
      }
      setCarregando(false);
    }, (error) => {
      console.error("Firebase erro:", error);
      setCarregando(false);
    });

    return () => unsubscribe();
  }, []);

  // ── Registrar recebimento ─────────────────────────────────────────────────
  const confirmar = async () => {
    if (!cobrador || !idBoleto.trim() || !nomeCliente.trim() || !valorInput) {
      setErro("Preencha todos os campos."); return;
    }
    const valor = parseCurrency(valorInput);
    if (!valor) { setErro("Valor inválido."); return; }

    const idLimpo = idBoleto.trim();

    // Validação de duplicidade (registros já está sincronizado via onValue)
    const duplicado = registros.find(
      r => r.idBoleto.toLowerCase() === idLimpo.toLowerCase()
    );
    if (duplicado) {
      setErro(`Boleto ${idLimpo} já registrado por ${duplicado.cobrador} em ${formatDate(duplicado.registradoEm)}.`);
      return;
    }

    setSalvando(true);
    try {
      const id = gerarId();
      const novo = {
        id,
        cobrador,
        idBoleto: idLimpo,
        nomeCliente: nomeCliente.trim(),
        valor,
        registradoEm: new Date().toISOString(),
      };
      // update() em vez de set() evita sobrescrever registros de outros usuários
      await update(ref(db, `${DB_PATH}/${id}`), novo);
      setSuccess(true);
      setIdBoleto(""); setNomeCliente(""); setValorInput(""); setErro("");
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      setErro("Erro ao salvar. Verifique sua conexão.");
    } finally {
      setSalvando(false);
    }
  };

  // ── Excluir registro ──────────────────────────────────────────────────────
  const excluir = async (id) => {
    try {
      await remove(ref(db, `${DB_PATH}/${id}`));
    } catch {
      alert("Erro ao excluir. Tente novamente.");
    } finally {
      setConfirmarExclusao(null);
    }
  };

  // ── Autenticação admin ────────────────────────────────────────────────────
  const entrarAdmin = async () => {
    if (!senhaInput) return;
    setAutenticando(true);
    try {
      const hash = await hashSenha(senhaInput);
      if (hash === HASH_SENHA_ADMIN) {
        setAdminAutenticado(true); setErroSenha("");
      } else {
        setErroSenha("Senha incorreta.");
      }
    } catch {
      setErroSenha("Erro ao verificar senha.");
    } finally {
      setAutenticando(false);
    }
  };

  // ── Exportar CSV ──────────────────────────────────────────────────────────
  const exportarCSV = () => {
    const rows = [["Cobrador", "ID Boleto", "Cliente", "Valor", "Registrado em"]];
    registrosFiltrados.forEach(r =>
      rows.push([r.cobrador, r.idBoleto, r.nomeCliente, r.valor, formatDate(r.registradoEm)])
    );
    const csv = "\uFEFF" + rows.map(r => r.join(";")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "cobrancas-xt.csv";
    a.click();
  };

  // ── Dados derivados ───────────────────────────────────────────────────────
  const registrosFiltrados = registros.filter(r => {
    const passaNome  = filtroNome ? r.cobrador === filtroNome : true;
    const term       = busca.toLowerCase();
    const passaBusca = !term ||
      r.idBoleto.toLowerCase().includes(term) ||
      r.nomeCliente.toLowerCase().includes(term) ||
      r.cobrador.toLowerCase().includes(term);
    return passaNome && passaBusca;
  });

  const ranking = COBRADORES.map(nome => {
    const regs = registros.filter(r => r.cobrador === nome);
    return { nome, qtd: regs.length, total: regs.reduce((a, r) => a + Number(r.valor), 0) };
  }).sort((a, b) => b.total - a.total);

  const dadosPorDia = (() => {
    const mapa = {};
    registros.forEach(r => {
      const dia = new Date(r.registradoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (!mapa[dia]) { mapa[dia] = { dia }; COBRADORES.forEach(n => (mapa[dia][n] = 0)); }
      mapa[dia][r.cobrador] = (mapa[dia][r.cobrador] || 0) + Number(r.valor);
    });
    return Object.values(mapa).sort((a, b) => {
      const [da, ma] = a.dia.split("/").map(Number);
      const [db2, mb] = b.dia.split("/").map(Number);
      return ma !== mb ? ma - mb : da - db2;
    });
  })();

  const CORES = ["#f5a623", "#60a5fa"];

  // ── Loading ───────────────────────────────────────────────────────────────
  if (carregando) return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono','Courier New',monospace", color: "#4a5568" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: "32px", height: "32px", border: "2px solid #1e2d4a", borderTopColor: "#f5a623", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 16px" }} />
        <div style={{ fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase" }}>Conectando...</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", fontFamily: "'DM Mono','Courier New',monospace", color: "#e8eaf0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing:border-box; }
        :root { --gold:#f5a623; --border:#1e2d4a; --muted:#4a5568; --card:#0f1625; --success:#22c55e; --danger:#ef4444; }
        .nav-btn { background:transparent; border:1px solid var(--border); color:var(--muted); padding:8px 20px; cursor:pointer; font-family:inherit; font-size:11px; letter-spacing:2px; text-transform:uppercase; transition:all .2s; }
        .nav-btn:hover,.nav-btn.active { border-color:var(--gold); color:var(--gold); background:rgba(245,166,35,.08); }
        .inp { width:100%; background:#0a0e1a; border:1px solid var(--border); color:#e8eaf0; padding:14px 18px; font-family:inherit; font-size:14px; outline:none; transition:border-color .2s; -webkit-appearance:none; }
        .inp:focus { border-color:var(--gold); }
        .inp option { background:#0f1625; }
        .btn { background:var(--gold); color:#0a0e1a; border:none; padding:14px 32px; font-family:inherit; font-size:12px; font-weight:500; letter-spacing:2px; text-transform:uppercase; cursor:pointer; transition:all .2s; width:100%; }
        .btn:hover:not(:disabled) { background:#ffbe4a; }
        .btn:disabled { opacity:.4; cursor:not-allowed; }
        .btn-ghost { background:transparent; color:var(--muted); border:1px solid var(--border); padding:10px 24px; font-family:inherit; font-size:11px; letter-spacing:2px; text-transform:uppercase; cursor:pointer; transition:all .2s; }
        .btn-ghost:hover { color:#e8eaf0; border-color:#4a5568; }
        .btn-danger { background:transparent; color:var(--danger); border:1px solid var(--danger); padding:6px 14px; font-family:inherit; font-size:10px; letter-spacing:1px; text-transform:uppercase; cursor:pointer; transition:all .2s; }
        .btn-danger:hover { background:rgba(239,68,68,.1); }
        .btn-danger-confirm { background:var(--danger); color:#fff; border:none; padding:6px 14px; font-family:inherit; font-size:10px; letter-spacing:1px; text-transform:uppercase; cursor:pointer; }
        .card { background:var(--card); border:1px solid var(--border); padding:24px; }
        .label { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:var(--muted); margin-bottom:8px; display:block; }
        .success-banner { background:rgba(34,197,94,.1); border:1px solid var(--success); color:var(--success); padding:16px 24px; text-align:center; font-size:12px; letter-spacing:2px; text-transform:uppercase; animation:fadeIn .3s ease; margin-bottom:24px; }
        .warn-banner { background:rgba(245,166,35,.08); border:1px solid var(--gold); color:var(--gold); padding:12px 18px; font-size:11px; letter-spacing:1px; margin-bottom:16px; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        .tr { border-bottom:1px solid var(--border); }
        .tr:hover { background:rgba(245,166,35,.03); }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.7); display:flex; align-items:center; justify-content:center; z-index:100; }
        .saving-bar { position:fixed; top:0; left:0; right:0; background:var(--gold); height:2px; animation:pulse 1s ease-in-out infinite; z-index:200; }
        @keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
      `}</style>

      {salvando && <div className="saving-bar" />}

      {/* MODAL EXCLUSÃO */}
      {confirmarExclusao !== null && (
        <div className="modal-overlay">
          <div className="card" style={{ maxWidth: "380px", width: "90%", textAlign: "center" }}>
            <div style={{ fontSize: "28px", marginBottom: "16px" }}>⚠</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "18px", fontWeight: 800, marginBottom: "8px" }}>Confirmar exclusão</div>
            <div style={{ color: "var(--muted)", fontSize: "13px", marginBottom: "28px" }}>Esse registro será removido permanentemente.</div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
              <button className="btn-ghost" onClick={() => setConfirmarExclusao(null)}>Cancelar</button>
              <button className="btn-danger-confirm" onClick={() => excluir(confirmarExclusao)}>Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "18px", fontWeight: 800, letterSpacing: "3px" }}>
            XT<span style={{ color: "var(--gold)" }}>.</span>FIBRA
          </div>
          <div style={{ fontSize: "9px", letterSpacing: "3px", color: "var(--muted)", textTransform: "uppercase", marginTop: "2px" }}>Portal de Cobrança</div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className={`nav-btn ${view === "form" ? "active" : ""}`} onClick={() => setView("form")}>Registrar</button>
          <button className={`nav-btn ${view === "historico" ? "active" : ""}`} onClick={() => setView("historico")}>Histórico</button>
          <button className={`nav-btn ${view === "admin" ? "active" : ""}`} onClick={() => setView("admin")}>Supervisão</button>
        </div>
      </div>

      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 24px" }}>

        {/* ── FORM ── */}
        {view === "form" && (
          <div>
            <div style={{ marginBottom: "32px" }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>Registrar Recebimento</div>
              <div style={{ color: "var(--muted)", fontSize: "13px" }}>Preencha os dados do boleto recebido</div>
            </div>
            {success && <div className="success-banner">✓  Recebimento registrado com sucesso</div>}
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <label className="label">Cobrador</label>
                <select className="inp" value={cobrador} onChange={e => setCobrador(e.target.value)}>
                  <option value="">— selecione —</option>
                  {COBRADORES.map(n => <option key={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="label">ID do Boleto</label>
                <input className="inp" type="text" value={idBoleto} onChange={e => { setIdBoleto(e.target.value); setErro(""); }} placeholder="Ex: 10483" />
              </div>
              <div>
                <label className="label">Nome do Cliente</label>
                <input className="inp" type="text" value={nomeCliente} onChange={e => { setNomeCliente(e.target.value); setErro(""); }} placeholder="Nome completo" />
              </div>
              <div>
                <label className="label">Valor Recebido</label>
                <input className="inp" type="text" inputMode="numeric" value={valorInput ? `R$ ${valorInput}` : ""} onChange={e => handleValorInput(e, setValorInput)} placeholder="R$ 0,00" />
              </div>
              {erro && <div style={{ color: "var(--danger)", fontSize: "12px", letterSpacing: "1px", lineHeight: "1.6" }}>✗  {erro}</div>}
            </div>
            <div style={{ marginTop: "16px" }}>
              <button className="btn" disabled={!cobrador || !idBoleto || !nomeCliente || !valorInput || salvando} onClick={confirmar}>
                {salvando ? "Salvando..." : "Confirmar Recebimento"}
              </button>
            </div>
          </div>
        )}

        {/* ── HISTÓRICO ── */}
        {view === "historico" && (
          <div>
            <div style={{ marginBottom: "24px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "24px", fontWeight: 800, marginBottom: "4px" }}>Histórico</div>
                <div style={{ color: "var(--muted)", fontSize: "13px" }}>{registrosFiltrados.length} registro{registrosFiltrados.length !== 1 ? "s" : ""}</div>
              </div>
              {registrosFiltrados.length > 0 && (
                <button className="btn-ghost" onClick={exportarCSV}>↓ Exportar CSV</button>
              )}
            </div>
            <div className="warn-banner">
              ⚠  Este histórico é compartilhado. Use o filtro para ver apenas seus registros.
            </div>
            <div style={{ marginBottom: "16px", display: "flex", gap: "8px" }}>
              <input className="inp" type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por cliente, ID ou cobrador..." style={{ flex: 1 }} />
              <select className="inp" value={filtroNome} onChange={e => setFiltroNome(e.target.value)} style={{ width: "200px" }}>
                <option value="">Todos</option>
                {COBRADORES.map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            {registrosFiltrados.length === 0 ? (
              <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: "48px" }}>
                <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase" }}>Nenhum registro encontrado</div>
              </div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Cobrador", "ID Boleto", "Cliente", "Valor", "Data"].map((h, i) => (
                        <th key={i} style={{ textAlign: "left", padding: "12px 16px", color: "var(--muted)", letterSpacing: "1px", textTransform: "uppercase", fontWeight: 400, fontSize: "10px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {registrosFiltrados.map(r => (
                      <tr key={r.id} className="tr">
                        <td style={{ padding: "12px 16px", color: "var(--gold)" }}>{r.cobrador}</td>
                        <td style={{ padding: "12px 16px" }}>{r.idBoleto}</td>
                        <td style={{ padding: "12px 16px", color: "var(--muted)" }}>{r.nomeCliente}</td>
                        <td style={{ padding: "12px 16px" }}>{formatCurrency(r.valor)}</td>
                        <td style={{ padding: "12px 16px", color: "var(--muted)", fontSize: "11px" }}>{formatDate(r.registradoEm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {registrosFiltrados.length > 0 && (
              <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--muted)", textTransform: "uppercase" }}>Total recebido</div>
                  <div style={{ fontSize: "20px", color: "var(--gold)" }}>
                    {formatCurrency(registrosFiltrados.reduce((a, r) => a + Number(r.valor), 0))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SUPERVISÃO ── */}
        {view === "admin" && (
          <div>
            {!adminAutenticado ? (
              <div>
                <div style={{ marginBottom: "32px" }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>Área Restrita</div>
                  <div style={{ color: "var(--muted)", fontSize: "13px" }}>Acesso exclusivo para supervisores</div>
                </div>
                <div className="card" style={{ marginBottom: "16px" }}>
                  <label className="label">Senha</label>
                  <input className="inp" type="password" value={senhaInput} onChange={e => { setSenhaInput(e.target.value); setErroSenha(""); }} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && entrarAdmin()} />
                  {erroSenha && <div style={{ marginTop: "12px", color: "var(--danger)", fontSize: "12px", letterSpacing: "1px" }}>✗  {erroSenha}</div>}
                </div>
                <button className="btn" onClick={entrarAdmin} disabled={!senhaInput || autenticando}>
                  {autenticando ? "Verificando..." : "Entrar"}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: "32px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>Supervisão</div>
                    <div style={{ color: "var(--muted)", fontSize: "13px" }}>Resultado das cobradores no período</div>
                  </div>
                  <button className="btn-ghost" onClick={() => { setAdminAutenticado(false); setSenhaInput(""); }}>Sair</button>
                </div>

                {/* RANKING */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "2px" }}>
                  {ranking.map((c, i) => {
                    const max = ranking[0]?.total || 1;
                    const pct = (c.total / max) * 100;
                    return (
                      <div key={c.nome} className="card" style={{ padding: "20px 24px", position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: i === 0 ? "rgba(245,166,35,.08)" : "rgba(255,255,255,.02)" }} />
                        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                            <div style={{ width: "28px", height: "28px", background: i === 0 ? "var(--gold)" : "var(--border)", color: i === 0 ? "#0a0e1a" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 500 }}>{i + 1}</div>
                            <div>
                              <div style={{ fontSize: "14px" }}>{c.nome}</div>
                              <div style={{ fontSize: "11px", color: "var(--muted)" }}>{c.qtd} registro{c.qtd !== 1 ? "s" : ""}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: "16px", color: i === 0 ? "var(--gold)" : "#e8eaf0" }}>{formatCurrency(c.total)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* GRÁFICO BARRAS */}
                <div className="card" style={{ marginBottom: "2px" }}>
                  <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--muted)", textTransform: "uppercase", marginBottom: "20px" }}>Recebido por cobrador</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={ranking} barSize={40}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" vertical={false} />
                      <XAxis dataKey="nome" tick={{ fill: "#4a5568", fontSize: 11, fontFamily: "inherit" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#4a5568", fontSize: 10, fontFamily: "inherit" }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ background: "#0f1625", border: "1px solid #1e2d4a", borderRadius: 0, fontFamily: "inherit", fontSize: 12 }} labelStyle={{ color: "#f5a623" }} formatter={v => [formatCurrency(v), "Total"]} cursor={{ fill: "rgba(245,166,35,.06)" }} />
                      <Bar dataKey="total" fill="#f5a623" radius={0} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* GRÁFICO LINHA */}
                {dadosPorDia.length > 1 && (
                  <div className="card" style={{ marginBottom: "2px" }}>
                    <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--muted)", textTransform: "uppercase", marginBottom: "20px" }}>Evolução diária</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={dadosPorDia}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" vertical={false} />
                        <XAxis dataKey="dia" tick={{ fill: "#4a5568", fontSize: 11, fontFamily: "inherit" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#4a5568", fontSize: 10, fontFamily: "inherit" }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{ background: "#0f1625", border: "1px solid #1e2d4a", borderRadius: 0, fontFamily: "inherit", fontSize: 12 }} formatter={v => [formatCurrency(v)]} cursor={{ stroke: "rgba(245,166,35,.2)" }} />
                        <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "inherit", paddingTop: "12px" }} />
                        {COBRADORES.map((nome, i) => (
                          <Line key={nome} type="monotone" dataKey={nome} stroke={CORES[i]} strokeWidth={2} dot={{ fill: CORES[i], r: 3 }} activeDot={{ r: 5 }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* TABELA COM REMOÇÃO */}
                <div className="card" style={{ padding: 0, marginBottom: "2px" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--muted)", textTransform: "uppercase" }}>Todos os registros</span>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>{registros.length} registro{registros.length !== 1 ? "s" : ""}</span>
                  </div>
                  {registros.length === 0 ? (
                    <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase" }}>Nenhum registro</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          {["Cobrador", "ID Boleto", "Cliente", "Valor", "Data", ""].map((h, i) => (
                            <th key={i} style={{ textAlign: "left", padding: "10px 16px", color: "var(--muted)", letterSpacing: "1px", textTransform: "uppercase", fontWeight: 400, fontSize: "10px" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {registros.map(r => (
                          <tr key={r.id} className="tr">
                            <td style={{ padding: "10px 16px", color: "var(--gold)" }}>{r.cobrador}</td>
                            <td style={{ padding: "10px 16px" }}>{r.idBoleto}</td>
                            <td style={{ padding: "10px 16px", color: "var(--muted)" }}>{r.nomeCliente}</td>
                            <td style={{ padding: "10px 16px" }}>{formatCurrency(r.valor)}</td>
                            <td style={{ padding: "10px 16px", color: "var(--muted)", fontSize: "11px" }}>{formatDate(r.registradoEm)}</td>
                            <td style={{ padding: "10px 16px" }}>
                              <button className="btn-danger" onClick={() => setConfirmarExclusao(r.id)}>Remover</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* TOTAIS */}
                <div style={{ display: "flex", gap: "2px" }}>
                  <div className="card" style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--muted)", textTransform: "uppercase", marginBottom: "8px" }}>Total geral</div>
                    <div style={{ fontSize: "22px", color: "var(--gold)" }}>{formatCurrency(registros.reduce((a, r) => a + Number(r.valor), 0))}</div>
                  </div>
                  <div className="card" style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--muted)", textTransform: "uppercase", marginBottom: "8px" }}>Total registros</div>
                    <div style={{ fontSize: "22px" }}>{registros.length}</div>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
