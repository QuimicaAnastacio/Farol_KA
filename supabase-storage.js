// ═══════════════════════════════════════════════════════
//  supabase-storage.js — Química Anastácio · Sistema OTIF
//  Substitui o github-storage.js
// ═══════════════════════════════════════════════════════

// ▶ CONFIGURE AQUI com seus dados do Supabase:
const SUPABASE_URL = "https://gccapgdlgouixlznrkrb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjY2FwZ2RsZ291aXhsem5ya3JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjI0NzksImV4cCI6MjA5MDAzODQ3OX0.DSqv9LPZxsBq_aantFaF75TiONntqiJWydtiJ6Lrkck";

// ─── Helpers de fetch para a API REST do Supabase ───────
function sbFetch(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(options.headers || {})
    }
  });
}

function sbGet(path) {
  return sbFetch(path).then(r => r.json());
}

function sbUpsert(table, data) {
  const body = Array.isArray(data) ? data : [data];
  return sbFetch(table, {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body)
  }).then(r => r.json());
}

function sbDelete(table, filter) {
  return sbFetch(`${table}?${filter}`, { method: "DELETE" }).then(r => r.ok);
}

// ─── Validação ───────────────────────────────────────────
function supabaseConfigValid() {
  return (
    SUPABASE_URL &&
    !SUPABASE_URL.includes("SEU_PROJECT_URL") &&
    SUPABASE_KEY &&
    !SUPABASE_KEY.includes("SUA_ANON_KEY")
  );
}

// Para manter compatibilidade com o código do index.html
// (ele chama githubConfigValid)
function githubConfigValid() {
  return supabaseConfigValid();
}

// ─── CARREGAR todos os dados ──────────────────────────────
async function githubLoad() {
  if (!supabaseConfigValid()) return null;
  try {
    const [clientes, indicadores, registrosRaw, acoesRaw, fncsRaw] = await Promise.all([
      sbGet("clientes?order=created_at.asc"),
      sbGet("indicadores?order=ordem.asc"),
      sbGet("registros?select=*"),
      sbGet("acoes?order=created_at.asc"),
      sbGet("fncs?select=*"),
    ]);

    // Converte registros: expande o campo JSONB "dados" de volta para colunas
    const registros = (registrosRaw || []).map(r => ({
      cid: r.cid,
      y: r.y,
      m: r.m,
      otif: r.otif,
      ...(r.dados || {})
    }));

    // Converte ações: snake_case → camelCase
    const acoes = (acoesRaw || []).map(a => ({
      id: a.id,
      mes: a.mes || "",
      cliente: a.cliente || "",
      desvio: a.desvio || "",
      material: a.material || "",
      embalagem: a.embalagem || "",
      volume: a.volume || "",
      dataDesvio: a.data_desvio || "",
      responsavel: a.responsavel || "",
      fnc: a.fnc || "",
      planoAcao: a.plano_acao || ""
    }));

    // Converte FNCs: expande o campo JSONB "dados"
    const fncs = (fncsRaw || []).map(f => ({ id: f.id, ...(f.dados || {}) }));

    return {
      clientes: clientes || [],
      indicadores: indicadores || [],
      registros,
      acoes,
      fncs
    };
  } catch (err) {
    console.error("Erro ao carregar do Supabase:", err);
    return null;
  }
}

// ─── SALVAR todos os dados ────────────────────────────────
async function githubSave(data) {
  if (!supabaseConfigValid()) return false;
  try {
    // 1. Clientes
    if (data.clientes && data.clientes.length) {
      await sbUpsert("clientes", data.clientes.map(c => ({
        id: c.id,
        name: c.name,
        logo: c.logo || null,
        active: c.active !== false
      })));
    }

    // 2. Indicadores
    if (data.indicadores && data.indicadores.length) {
      await sbUpsert("indicadores", data.indicadores.map((ind, i) => ({
        key: ind.key,
        label: ind.label,
        ordem: i
      })));
    }

    // 3. Registros — empacota os faróis no campo JSONB "dados"
    if (data.registros && data.registros.length) {
      const registros = data.registros.map(r => {
        const { cid, y, m, otif, ...rest } = r;
        return { cid, y, m, otif, dados: rest };
      });
      await sbUpsert("registros", registros);
    }

    // 4. Ações — camelCase → snake_case
    if (data.acoes) {
      // Apaga tudo e reinserere (simples para este volume de dados)
      await sbFetch("acoes?id=gt.0", { method: "DELETE" });
      if (data.acoes.length) {
        await sbUpsert("acoes", data.acoes.map(a => ({
          id: a.id,
          mes: a.mes || "",
          cliente: a.cliente || "",
          desvio: a.desvio || "",
          material: a.material || "",
          embalagem: a.embalagem || "",
          volume: a.volume || "",
          data_desvio: a.dataDesvio || "",
          responsavel: a.responsavel || "",
          fnc: a.fnc || "",
          plano_acao: a.planoAcao || ""
        })));
      }
    }

    // 5. FNCs — empacota tudo no campo JSONB "dados"
    if (data.fncs) {
      await sbFetch("fncs?id=gt.0", { method: "DELETE" });
      if (data.fncs.length) {
        await sbUpsert("fncs", data.fncs.map(f => {
          const { id, ...rest } = f;
          return { id, dados: rest };
        }));
      }
    }

    return true;
  } catch (err) {
    console.error("Erro ao salvar no Supabase:", err);
    return false;
  }
}
