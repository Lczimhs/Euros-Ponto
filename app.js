
/**
 * Hidratação inicial do banco local persistido no servidor (banco_proprio_local.json)
 */
async function carregarEstadoDoServidorLocal() {
  if (typeof fetch !== 'function') return;
  try {
    const res = await fetch(`${API_BASE}/api/carregar-estado-local`).then(r => r.json());
    if (res && res.ok && res.data && Array.isArray(res.data.colaboradores) && res.data.colaboradores.length >= 5) {
      const serverData = res.data;
      const serverTime = new Date(serverData.updatedAt || 0).getTime();
      const localTime = new Date(appState.updatedAt || 0).getTime();
      const serverCount = Object.keys(serverData.registrosPonto || {}).length;
      const localCount = Object.keys(appState.registrosPonto || {}).length;

      if (serverTime >= localTime || serverCount >= localCount) {
        console.log(`[Startup] Carregando banco local do servidor (${serverCount} registros, atualizado em ${new Date(serverTime).toLocaleTimeString()})...`);
        applyRemoteState(serverData, false);
        appState.updatedAt = serverData.updatedAt || new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverData));
        localStorage.setItem(STORAGE_KEY + '_backup', JSON.stringify(serverData));
        renderCurrentView();
      }
    }
  } catch (e) {
    console.warn('[Startup] Servidor local offline ou indisponível:', e);
  }
}

/**
 * DASHBOARD DE PONTO E VALE ALIMENTAÇÃO (V4)
 * Motor Completo de Ponto, Apuração de VA, DSR e Gestão
 */

// Chave do LocalStorage e Versão Mestra de Segurança
const STORAGE_KEY = 'appLucas_ponto_va_v5_data';
const MASTER_RECOVERY_VERSION = 2026103002;

// ==========================================================================
// 1. ESTADO GLOBAL DA APLICAÇÃO
// ==========================================================================
let appState = {
  activeView: 'view-ponto',
  activeBranchId: 'branch-1',
  currentYear: 2026,
  currentMonth: 9, // Outubro (0-indexed: 9 = Outubro)
  statusFilter: 'ativos', // 'ativos' | 'demitidos' | 'todos'
  departmentFilter: 'todos', // 'todos' ou ID do departamento
  calFilterDept: 'todos',    // filtro de depto no calendário
  focusMode: false,
  searchFilter: '',
  sortBy: 'cracha', // 'cracha' | 'nome' | 'data_admissao' | 'departamento'

  // Dados Persistidos
  filiais: [],
  departamentos: [],
  colaboradores: [],
  feriados: [],
  avisos: [],
  registrosPonto: {}, // chave: colabId_YYYY-MM-DD => { override, resolution, punches, note }
  carryOverDsr: {}    // chave: colabId_YYYY-MM => número de DSRs transferidos
};

// ==========================================================================
// CONFIGURAÇÃO DO MOTOR DE AUTOMAÇÃO NGPONTO / CONTROL ID (PORTA 3050)
// ==========================================================================
const API_BASE = (typeof window !== 'undefined' && (window.location.port === '3050' || window.location.port === '3000'))
  ? ''
  : 'http://localhost:3050';

function formatMotorErrorMessage(e, defaultPrefix = 'Erro ao comunicar com o motor') {
  return `${defaultPrefix}: ${e?.message || e}`;
}


// ==========================================================================
// CONFIGURAÇÃO DO SUPABASE CLOUD + PONTE REMOTA PARA VERCEL -> MOTOR LOCAL
// ==========================================================================
const SUPABASE_URL = 'https://isuynftkmcdaymczhckx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_QJeX4fW2543ePivoeZzmzQ__u3AFLhY';
let supabaseClient = null;

try {
  if (typeof window !== 'undefined' && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase Cloud conectado com sucesso:', SUPABASE_URL);
  }
} catch (e) {
  console.warn('Erro ao inicializar Supabase client:', e);
}

async function fetchViaSupabaseBridge(urlStr, init = {}, nativeFetchFn = fetch) {
  let pathAndQuery = urlStr;
  try {
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
      const u = new URL(urlStr);
      pathAndQuery = u.pathname + u.search;
    }
  } catch (e) {}

  const reqId = 'rpc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const method = (init.method || 'GET').toUpperCase();
  let bodyData = null;
  if (init.body) {
    try { bodyData = JSON.parse(init.body); } catch (e) { bodyData = init.body; }
  }

  const sbHeaders = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };

  const postRes = await nativeFetchFn(`${SUPABASE_URL}/rest/v1/config_app`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: reqId,
      data: {
        type: 'motor_rpc_request',
        status: 'pending',
        method,
        url: pathAndQuery,
        body: bodyData,
        createdAt: Date.now()
      },
      updated_at: new Date().toISOString()
    })
  });

  if (!postRes.ok) {
    throw new Error('Falha ao enviar comando pela Ponte Cloud (' + postRes.status + ')');
  }

  const timeoutMs = 150 * 1000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 900));
    const pollRes = await nativeFetchFn(`${SUPABASE_URL}/rest/v1/config_app?id=eq.${encodeURIComponent(reqId)}&select=data`, {
      method: 'GET',
      headers: sbHeaders
    });
    if (!pollRes.ok) continue;
    const rows = await pollRes.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row && row.data && row.data.status === 'done') {
      nativeFetchFn(`${SUPABASE_URL}/rest/v1/config_app?id=eq.${encodeURIComponent(reqId)}`, {
        method: 'DELETE',
        headers: sbHeaders
      }).catch(() => {});

      return new Response(JSON.stringify(row.data.response || { ok: false, erro: 'Resposta vazia do motor' }), {
        status: row.data.httpStatus || 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  throw new Error('O Motor Local (servidor.js) não respondeu. Verifique se o computador do DP está ligado.');
}

if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const _nativeFetch = window.fetch.bind(window);
  window._nativeFetch = _nativeFetch;
  window.fetch = async function(input, init) {
    const urlStr = typeof input === 'string' ? input : (input?.url || String(input));
    const isMotorApi = urlStr.includes('/api/') && !urlStr.includes('supabase.co');
    if (!isMotorApi) {
      return _nativeFetch(input, init);
    }
    const isHttps = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
    if (isHttps) {
      return await fetchViaSupabaseBridge(urlStr, init, _nativeFetch);
    }
    try {
      return await _nativeFetch(input, init);
    } catch (localErr) {
      console.log('Ponte Cloud Supabase acionada automaticamente para:', urlStr);
      return await fetchViaSupabaseBridge(urlStr, init, _nativeFetch);
    }
  };
}

// ==========================================================================
// 2. DADOS PADRÃO DE DEMONSTRAÇÃO (SEED COM DADOS REAIS DA EMPRESA)
// ==========================================================================
function getDefaultSeedData() {
  const master = (typeof window !== 'undefined') ? (window.GOLD_RECOVERY_DATA || window.BACKUP_DATA) : null;
  if (master && master.colaboradores && master.colaboradores.length >= 100) {
    return JSON.parse(JSON.stringify(master));
  }

  const filiais = [
    {
      "id": "branch-1",
      "nome": "Euros Ind. e Comércio de Aço - Matriz",
      "cidade": "Ji-Paraná - RO"
    },
    {
      "id": "branch-2",
      "nome": "Euros Ind. e Comércio de Aço - Filial",
      "cidade": "Naviraí - MS"
    },
    {
      "id": "branch-3",
      "nome": "Euros Distribuidora de Mat. Construção",
      "cidade": "Ji-Paraná - RO"
    },
    {
      "id": "branch-4",
      "nome": "Caiari - 00",
      "cidade": "Ji-Paraná - RO"
    }
  ];

  const departamentos = [
    {
      "id": "dept-admin",
      "nome": "ADMIN"
    },
    {
      "id": "dept-producao",
      "nome": "PRODUÇÃO"
    },
    {
      "id": "dept-deposito",
      "nome": "DEPOSITO"
    },
    {
      "id": "dept-obra",
      "nome": "OBRA"
    },
    {
      "id": "dept-admin-sponto",
      "nome": "ADMIN-S/PONTO"
    }
  ];

  const colaboradores = [
      {
          "id": "colab_branch-1_1026",
          "cracha": 1026,
          "nome": "IAN VINICIUS NERES LEITE",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2026-09-21",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1031",
          "cracha": 1031,
          "nome": "IRACI EVANGELISTA DOS SANTOS",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2026-09-30",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1",
          "cracha": 1,
          "nome": "DICEFANI MACEDO FERRARINI",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2014-02-03",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_218",
          "cracha": 218,
          "nome": "MARCOS BATISTA GONCALVES",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2007-07-11",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_234",
          "cracha": 234,
          "nome": "GILMAR SABINO DA SILVA",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2014-05-07",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_325",
          "cracha": 325,
          "nome": "JORGE LUIZ DE ANDRADE",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2019-07-31",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_336",
          "cracha": 336,
          "nome": "CLAUDINEI RIBEIRO FERNANDES",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2019-09-20",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_354",
          "cracha": 354,
          "nome": "JOSE MARIA ALVES DA CRUZ",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2020-01-24",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_361",
          "cracha": 361,
          "nome": "FERNANDA CRISTINA PAIXAO DE ALMEIDA",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2020-02-12",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_431",
          "cracha": 431,
          "nome": "RONALDO RIBEIRO DE ARAUJO",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2020-10-30",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_491",
          "cracha": 491,
          "nome": "GILMAR OTERIO DA SILVA DACOL",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2021-05-10",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_540",
          "cracha": 540,
          "nome": "LEONILDO TABORDA BARBOSA",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2021-10-14",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_545",
          "cracha": 545,
          "nome": "ANTONIO BRITO SANTOS",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2010-01-02",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_663",
          "cracha": 663,
          "nome": "DEVAIR DUARTE SANCHES",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2023-02-16",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_668",
          "cracha": 668,
          "nome": "JURANDI CAETANO SOARES",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2023-02-24",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_696",
          "cracha": 696,
          "nome": "ANTONIO DA SILVA",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2007-03-01",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_701",
          "cracha": 701,
          "nome": "ANTONIO GOMES COELHO",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2023-07-06",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_702",
          "cracha": 702,
          "nome": "BRUNO RIBEIRO DA SILVA",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2023-07-10",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_736",
          "cracha": 736,
          "nome": "EDINEIA CELIA DOS SANTOS",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2023-12-18",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_778",
          "cracha": 778,
          "nome": "ANGELICA DA SILVA GAMA",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2024-04-19",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_781",
          "cracha": 781,
          "nome": "RAFAEL DE JESUS CARDOSO",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2024-05-06",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_847",
          "cracha": 847,
          "nome": "HEBER LUCAS LEONEL FONESI",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2024-11-14",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_858",
          "cracha": 858,
          "nome": "LUCIANA GUIMARÃES DOS SANTOS",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2014-02-06",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_863",
          "cracha": 863,
          "nome": "KELVY ALVES COELHO",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2024-12-11",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_898",
          "cracha": 898,
          "nome": "JOSÉ PAULO DO NASCIMENTO",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2025-03-03",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_900",
          "cracha": 900,
          "nome": "JANAINA CARDOSO DA SILVA",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2025-03-12",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_908",
          "cracha": 908,
          "nome": "ADRIANA DE SOUZA",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2025-05-19",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_914",
          "cracha": 914,
          "nome": "DANILO NATA DA SILVA SANTOS",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2025-06-10",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_917",
          "cracha": 917,
          "nome": "PATRICIA MARTINS BENEDITO",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2025-06-24",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1173",
          "cracha": 1173,
          "nome": "LUANA CAMILO DE MORAES",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2013-12-12",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1405",
          "cracha": 1405,
          "nome": "LUCAS TUPAN DA SILVA",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2020-01-14",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_937",
          "cracha": 937,
          "nome": "HUGO HENRIQUE CIONI",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2025-09-08",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_942",
          "cracha": 942,
          "nome": "USIEL OLIVEIRA",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2025-09-16",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_954",
          "cracha": 954,
          "nome": "WALLYSON PEREIRA DE MELO",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2025-11-06",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_955",
          "cracha": 955,
          "nome": "JOSE LUIZ DA SILVA",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2025-11-17",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_961",
          "cracha": 961,
          "nome": "LEONARDO VIEIRA DOS SANTOS",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2025-12-19",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_963",
          "cracha": 963,
          "nome": "KELIANE GONCALVES DE SOUZA",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2026-01-05",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_965",
          "cracha": 965,
          "nome": "LEANDRO MARTINS DO NASCIMENTO",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2026-01-10",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_970",
          "cracha": 970,
          "nome": "ANTONIO ALVES DE SOUZA",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2026-01-29",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_974",
          "cracha": 974,
          "nome": "EUCLIDES NUNES DOS SANTOS",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2026-02-09",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_975",
          "cracha": 975,
          "nome": "EDUARDO DE OLIVEIRA SILVA",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2026-02-17",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_986",
          "cracha": 986,
          "nome": "ALESSANDRO DE SOUSA PAIVA",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2026-03-26",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_989",
          "cracha": 989,
          "nome": "LUCAS DOS SANTOS ABREU",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2026-04-22",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_997",
          "cracha": 997,
          "nome": "PATRICIA BARROSO PINHEIRO",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2026-05-28",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_999",
          "cracha": 999,
          "nome": "JOSEFA JANAINA RODRIGUES DE SOUZA",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2026-06-02",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1000",
          "cracha": 1000,
          "nome": "LUCAS VILAS BOAS BRITO",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2026-06-15",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1008",
          "cracha": 1008,
          "nome": "BRUNO PHELIPE VICENTE MACHADO",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2026-07-14",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1013",
          "cracha": 1013,
          "nome": "RIQUELME ALMEIDA PINHEIRO",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2026-08-03",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1018",
          "cracha": 1018,
          "nome": "LEONARDO SILVA KIKO",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2026-08-27",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1020",
          "cracha": 1020,
          "nome": "CARLOS HENRIQUE ANGELICO",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2024-05-27",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1025",
          "cracha": 1025,
          "nome": "KAUAN DE CARVALHO PENA",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2026-09-18",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1027",
          "cracha": 1027,
          "nome": "VANDEILSON DIAS DE MATOS",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2026-09-23",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1032",
          "cracha": 1032,
          "nome": "RAUL FERNANDO MENEGUETTI JACOB",
          "filialId": "branch-1",
          "deptId": "dept-admin",
          "admissao": "2026-07-07",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1033",
          "cracha": 1033,
          "nome": "PEDRO HENRIQUE DAMASCENO MELO",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2026-10-07",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-1_1034",
          "cracha": 1034,
          "nome": "WESLEY PATRICK FERNANDES DE OLIVEIRA",
          "filialId": "branch-1",
          "deptId": "dept-producao",
          "admissao": "2026-10-09",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_1016",
          "cracha": 1016,
          "nome": "GUILHERME ANTONIO DOS SANTOS",
          "filialId": "branch-2",
          "deptId": "dept-admin",
          "admissao": "2026-08-24",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_127",
          "cracha": 127,
          "nome": "LEONICE DA SILVA MOURA DE SOUZA",
          "filialId": "branch-2",
          "deptId": "dept-producao",
          "admissao": "2016-07-15",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_288",
          "cracha": 288,
          "nome": "SERGIO RIBEIRO",
          "filialId": "branch-2",
          "deptId": "dept-admin",
          "admissao": "2018-12-11",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_456",
          "cracha": 456,
          "nome": "PAULO SERGIO FERREIRA DA SILVA",
          "filialId": "branch-2",
          "deptId": "dept-producao",
          "admissao": "2021-01-28",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_463",
          "cracha": 463,
          "nome": "FABIO FARIAS",
          "filialId": "branch-2",
          "deptId": "dept-admin",
          "admissao": "2021-02-22",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_561",
          "cracha": 561,
          "nome": "LUCAS DE PAULA CARVALHO",
          "filialId": "branch-2",
          "deptId": "dept-producao",
          "admissao": "2022-01-24",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_613",
          "cracha": 613,
          "nome": "MARCO ANTONIO OLIVEIRA DE SOUZA",
          "filialId": "branch-2",
          "deptId": "dept-producao",
          "admissao": "2022-09-05",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_780",
          "cracha": 780,
          "nome": "LEONARDO MARINHO CARIS",
          "filialId": "branch-2",
          "deptId": "dept-producao",
          "admissao": "2024-04-24",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_810",
          "cracha": 810,
          "nome": "ROSANA SANABRIA FERREIRA DA SILVA",
          "filialId": "branch-2",
          "deptId": "dept-admin",
          "admissao": "2024-08-01",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_867",
          "cracha": 867,
          "nome": "APARICIO AMARILLA",
          "filialId": "branch-2",
          "deptId": "dept-producao",
          "admissao": "2024-12-17",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_890",
          "cracha": 890,
          "nome": "VICTORIA CAROLINA RODRIGUES DE CAMARGO",
          "filialId": "branch-2",
          "deptId": "dept-admin",
          "admissao": "2025-02-10",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_946",
          "cracha": 946,
          "nome": "EVELYN GABRIELE HARADA MANDUCO PRIORI",
          "filialId": "branch-2",
          "deptId": "dept-admin",
          "admissao": "2025-10-13",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_952",
          "cracha": 952,
          "nome": "ROBSON DA SILVA LUIZ",
          "filialId": "branch-2",
          "deptId": "dept-admin",
          "admissao": "2025-11-03",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_964",
          "cracha": 964,
          "nome": "WELLINGTON MARCELINO DOS SANTOS",
          "filialId": "branch-2",
          "deptId": "dept-producao",
          "admissao": "2026-01-10",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_977",
          "cracha": 977,
          "nome": "PAULO HENRIQUE CARVALHO BENTO",
          "filialId": "branch-2",
          "deptId": "dept-producao",
          "admissao": "2026-03-04",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_990",
          "cracha": 990,
          "nome": "ALESSANDRO FRETES FLORENCIANO",
          "filialId": "branch-2",
          "deptId": "dept-producao",
          "admissao": "2026-05-04",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_993",
          "cracha": 993,
          "nome": "PAULO LIMA DA SILVA",
          "filialId": "branch-2",
          "deptId": "dept-producao",
          "admissao": "2026-05-08",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_994",
          "cracha": 994,
          "nome": "TAMIRES TONINI DE MORAES",
          "filialId": "branch-2",
          "deptId": "dept-admin",
          "admissao": "2026-05-08",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-2_1009",
          "cracha": 1009,
          "nome": "MARTA APARECIDA DE SOUZA",
          "filialId": "branch-2",
          "deptId": "dept-producao",
          "admissao": "2026-07-20",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_363",
          "cracha": 363,
          "nome": "EMILLYN KAROLYNY GARCIA DE OLIVEIRA",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2026-08-31",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_234",
          "cracha": 234,
          "nome": "BRUNO WINICIUS DE SOUZA",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2020-07-16",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_241",
          "cracha": 241,
          "nome": "JHELKISSAN WOLKYN BARBOSA RUEDA",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2021-10-14",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_249",
          "cracha": 249,
          "nome": "RAIMUNDO MONTEIRO DE ARAUJO MELO",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2010-06-16",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_250",
          "cracha": 250,
          "nome": "RONALDO DE ASSIS MELO",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2010-02-12",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_255",
          "cracha": 255,
          "nome": "NILZA MARTINS DOS SANTOS",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2003-03-01",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_256",
          "cracha": 256,
          "nome": "DAVID JOSE NOGUEIRA DE SOUZA",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2005-07-01",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_294",
          "cracha": 294,
          "nome": "MALALIEL RODRIGUES",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2024-04-18",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_295",
          "cracha": 295,
          "nome": "GABRIEL FELIPE DOS SANTOS",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2024-07-05",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_313",
          "cracha": 313,
          "nome": "JHENIFER LOPES FERREIRA",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2025-02-03",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_335",
          "cracha": 335,
          "nome": "ADEMILSON MARCELO VILETE",
          "filialId": "branch-3",
          "deptId": "dept-deposito",
          "admissao": "2019-06-28",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_336",
          "cracha": 336,
          "nome": "JHONATAN JULIO DA SILVA REIS",
          "filialId": "branch-3",
          "deptId": "dept-deposito",
          "admissao": "2025-10-07",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_343",
          "cracha": 343,
          "nome": "GUILHERME HENRIQUE MELO COUTINHO",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2026-01-06",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_344",
          "cracha": 344,
          "nome": "WEVERTON SEBASTIAO FIGUEIREDO SOUZA",
          "filialId": "branch-3",
          "deptId": "dept-deposito",
          "admissao": "2026-02-09",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_350",
          "cracha": 350,
          "nome": "GABRIEL BARBOSA LOPES",
          "filialId": "branch-3",
          "deptId": "dept-deposito",
          "admissao": "2026-04-14",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_356",
          "cracha": 356,
          "nome": "FABIANA RODRIGUES DE JESUS",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2026-07-13",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_358",
          "cracha": 358,
          "nome": "MELQUISEDEQUE ABRANJO DE OLIVEIRA",
          "filialId": "branch-3",
          "deptId": "dept-deposito",
          "admissao": "2026-07-27",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_360",
          "cracha": 360,
          "nome": "ISABELA VIDAL MARTINS",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2026-08-17",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_361",
          "cracha": 361,
          "nome": "MAYCK CANDIDO DE JESUS",
          "filialId": "branch-3",
          "deptId": "dept-deposito",
          "admissao": "2026-08-27",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_364",
          "cracha": 364,
          "nome": "NARA LORENA PEREIRA RODRIGUES DA SILVA",
          "filialId": "branch-3",
          "deptId": "dept-admin",
          "admissao": "2026-04-27",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-3_365",
          "cracha": 365,
          "nome": "LEONARDO DE SOUZA SANTOS",
          "filialId": "branch-3",
          "deptId": "dept-deposito",
          "admissao": "2026-09-28",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-4_1491",
          "cracha": 1491,
          "nome": "ELITON ZAMAI DA SILVA",
          "filialId": "branch-4",
          "deptId": "dept-admin",
          "admissao": "2023-11-17",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      },
      {
          "id": "colab_branch-4_1494",
          "cracha": 1494,
          "nome": "FERNANDO ALVES DE SOUZA",
          "filialId": "branch-4",
          "deptId": "dept-obra",
          "admissao": "2025-12-10",
          "registraPonto": true,
          "status": "ativo",
          "dataDemissao": ""
      }
  ];

  const feriados = [
    { id: 'fer-1', data: '2026-01-01', nome: 'Confraternização Universal', escopo: 'NACIONAL' },
    { id: 'fer-2', data: '2026-02-17', nome: 'Carnaval', escopo: 'NACIONAL' },
    { id: 'fer-3', data: '2026-04-03', nome: 'Sexta-feira Santa', escopo: 'NACIONAL' },
    { id: 'fer-4', data: '2026-04-21', nome: 'Tiradentes', escopo: 'NACIONAL' },
    { id: 'fer-5', data: '2026-05-01', nome: 'Dia do Trabalhador', escopo: 'NACIONAL' },
    { id: 'fer-6', data: '2026-06-04', nome: 'Corpus Christi', escopo: 'NACIONAL' },
    { id: 'fer-7', data: '2026-09-07', nome: 'Independência do Brasil', escopo: 'NACIONAL' },
    { id: 'fer-8', data: '2026-10-12', nome: 'Nossa Senhora Aparecida', escopo: 'NACIONAL' },
    { id: 'fer-9', data: '2026-11-02', nome: 'Finados', escopo: 'NACIONAL' },
    { id: 'fer-10', data: '2026-11-15', nome: 'Proclamação da República', escopo: 'NACIONAL' },
    { id: 'fer-11', data: '2026-11-20', nome: 'Dia da Consciência Negra', escopo: 'NACIONAL' },
    { id: 'fer-12', data: '2026-12-25', nome: 'Natal', escopo: 'NACIONAL' }
  ];

  const avisos = [
    {
      id: "aviso-salario-1",
      data: "2026-10-07",
      titulo: "🟡 Pagamento de Salário Mensal (5º Dia Útil - CLT Art. 459)",
      tipo: "salario",
      descricao: "Crédito em conta corrente dos vencimentos mensais de todos os colaboradores até o 5º dia útil do mês subsequente.",
      filialId: "TODAS",
      colabId: "",
      concluido: true,
      concluidoEm: "2026-10-07T14:30:00Z",
      createdAt: "2026-10-01T08:00:00Z"
    },
    {
      id: "aviso-admissao-wesley",
      data: "2026-10-09",
      titulo: "🟢 Admissão Concluída - Wesley Patrick (Início de Atividades)",
      tipo: "outros",
      descricao: "Admissão e início oficial de atividades do colaborador Wesley Patrick Fernandes de Oliveira no setor de Produção.",
      filialId: "branch-1",
      colabId: "colab_branch-1_1034",
      concluido: true,
      concluidoEm: "2026-10-09T08:00:00Z",
      createdAt: "2026-10-09T08:00:00Z"
    },
    {
      id: "aviso-ferias-1",
      data: "2026-10-15",
      titulo: "🟣 Aviso Prévio de Férias - Carlos Henrique (30 dias antecedência CLT)",
      tipo: "ferias",
      descricao: "Comunicação formal por escrito com antecedência mínima de 30 dias (Art. 135 da CLT). Início das férias previsto para 15/11/2026.",
      filialId: "branch-1",
      colabId: "colab_branch-1_1020",
      concluido: false,
      concluidoEm: null,
      createdAt: "2026-10-05T09:00:00Z"
    },
    {
      id: "aviso-vale-1",
      data: "2026-10-20",
      titulo: "🟡 Adiantamento Salarial Quinzenal (Vale 40%)",
      tipo: "salario",
      descricao: "Pagamento do adiantamento salarial de 40% a todos os colaboradores com opção cadastrada.",
      filialId: "TODAS",
      colabId: "",
      concluido: false,
      concluidoEm: null,
      createdAt: "2026-10-01T08:00:00Z"
    },
    {
      id: "aviso-fgts-1",
      data: "2026-10-20",
      titulo: "🟢 Vencimento FGTS Digital / Guia eSocial",
      tipo: "fgts",
      descricao: "Recolhimento mensal das guias do FGTS Digital referente à competência anterior (Vencimento até o dia 20).",
      filialId: "TODAS",
      colabId: "",
      concluido: false,
      concluidoEm: null,
      createdAt: "2026-10-01T08:00:00Z"
    },
    {
      id: "aviso-ponto-1",
      data: "2026-10-31",
      titulo: "🔵 Fechamento de Ponto & VA (Último Dia Útil do Mês - Sábado)",
      tipo: "ponto",
      descricao: "Fechamento do espelho de ponto eletrônico e apuração definitiva do Vale Alimentação no último dia útil do mês (Sábado, 31/10/2026).",
      filialId: "TODAS",
      colabId: "",
      concluido: false,
      concluidoEm: null,
      createdAt: "2026-10-01T08:00:00Z"
    }
  ];

  const registrosPonto = {};
  const carryOverDsr = {};

  return { filiais, departamentos, colaboradores, feriados, avisos, registrosPonto, carryOverDsr };
}

// ==========================================================================
// CANAL DE SINCRONIZAÇÃO EM TEMPO REAL ENTRE ABAS E JANELAS (BroadcastChannel)
// ==========================================================================
const syncBroadcastChannel = (typeof window !== 'undefined' && typeof window.BroadcastChannel !== 'undefined')
  ? new BroadcastChannel('euros_ponto_channel_v1')
  : null;

/**
 * Normaliza e consolida um colaborador, garantindo estrita tipagem dos campos booleanos,
 * conversão do crachá para número, integridade de departamentos e persistência total.
 */

/**
 * Gera um ID único e determinístico com escopo por filial.
 * Permite que filiais diferentes tenham o mesmo número de crachá sem conflito.
 */
function generateColaboradorId(filialId, cracha) {
  const f = filialId || 'branch-1';
  return `colab_${f}_${cracha}`;
}

function normalizeColaborador(c) {
  if (!c) return null;
  const isAp = !!(
    c.aprendiz === true ||
    c.aprendiz === 'sim' ||
    c.aprendiz === 'true' ||
    c.aprendiz === 1 ||
    c.aprendiz === '1' ||
    c.isAprendiz === true
  );

  let registraPonto = !(
    c.registraPonto === false ||
    c.registraPonto === 'nao' ||
    c.registraPonto === 'false' ||
    c.registraPonto === 0 ||
    c.registraPonto === '0'
  );

  const naoRecebeVa = !!(
    c.naoRecebeVa === true ||
    c.naoRecebeVa === 'sim' ||
    c.naoRecebeVa === 'true' ||
    c.recebeVa === false ||
    c.recebeVa === 'nao' ||
    c.recebeVa === 'false'
  );

  let trabalhaSabado;
  if (c.trabalhaSabado !== undefined && c.trabalhaSabado !== null) {
    trabalhaSabado = (c.trabalhaSabado === true || c.trabalhaSabado === 'sim' || c.trabalhaSabado === 'true' || c.trabalhaSabado === 1);
  } else if (c.horariosSemana && c.horariosSemana['7']) {
    const s7 = c.horariosSemana['7'];
    trabalhaSabado = !s7.descanso && Boolean(s7.e1 || s7.s1);
  } else {
    trabalhaSabado = !isAp;
  }

  const crachaNum = Number(c.cracha);
  let filialId = c.filialId || 'branch-1';
  let crachaFinal = isNaN(crachaNum) ? c.cracha : crachaNum;
  let admissao = c.admissao || '2026-01-01';
  let nome = (c.nome || '').trim();

  // Unifica e normaliza ID do departamento (legado ou novo)
  let deptId = c.deptId || 'dept-admin';
  if (deptId === 'dept-1792071704664') {
    deptId = 'dept-admin-sponto';
  }

  // Regra Estrita de Escala e Ponto: Motoristas, vendedores, vigias e guardas da administração/indústria de Ji-Paraná NÃO batem ponto (folha manual)
  const spontoCrachas = [325, 336, 431, 540, 696, 702, 736, 781, 898, 937, 965, 974, 1020, 1027, 1031, 1032];
  if (spontoCrachas.includes(crachaNum) && (filialId === 'branch-1' || !c.filialId)) {
    deptId = 'dept-admin-sponto';
    registraPonto = false;
  }
  if (c.tipoFuncionario === 'Autônomo' || (c.cargo && /autônomo|autonomo/i.test(c.cargo))) {
    registraPonto = false;
  }

  // Garantia: Daniela Diniz da Costa (crachá 1039) adicionada no Relógio 2 ADM Ji-Paraná
  if (crachaNum === 1039) {
    filialId = 'branch-1';
    crachaFinal = 1039;
    deptId = 'dept-admin';
    registraPonto = true;
    admissao = '2026-10-26';
  }

  // Tratamento específico para garantir separação de homônimos de crachá
  if (nome.includes('FERNANDA CRISTINA PAIXAO DE ALMEIDA')) {
    filialId = 'branch-1';
    crachaFinal = 361;
    admissao = '2020-02-12';
    deptId = 'dept-admin';
  } else if (nome.includes('MAYCK CANDIDO DE JESUS')) {
    filialId = 'branch-3';
    crachaFinal = 361;
    admissao = '2026-08-27';
    deptId = 'dept-deposito';
  } else if (nome.includes('GILMAR SABINO DA SILVA')) {
    filialId = 'branch-1';
    crachaFinal = 234;
    admissao = '2014-05-07';
    deptId = 'dept-producao';
  } else if (nome.includes('BRUNO WINICIUS DE SOUZA')) {
    filialId = 'branch-3';
    crachaFinal = 234;
    admissao = '2020-07-16';
    deptId = 'dept-admin';
  } else if (nome.includes('CLAUDINEI RIBEIRO FERNANDES')) {
    filialId = 'branch-1';
    crachaFinal = 336;
    admissao = '2019-09-20';
    deptId = 'dept-admin-sponto';
  } else if (nome.includes('JHONATAN JULIO DA SILVA REIS')) {
    filialId = 'branch-3';
    crachaFinal = 336;
    admissao = '2025-10-07';
    deptId = 'dept-deposito';
  }

  // Determina relogioVinculo consistente
  let relogioVinculo = c.relogioVinculo;
  if (!relogioVinculo) {
    if (crachaNum === 1039) relogioVinculo = 'relogio2_adm';
    else if (deptId === 'dept-admin-sponto' || spontoCrachas.includes(crachaNum)) relogioVinculo = 'folha_manual';
    else if (filialId === 'branch-4') relogioVinculo = 'relogio4_caiari';
    else if (filialId === 'branch-2') relogioVinculo = 'relogio3_navirai';
    else if (deptId === 'dept-producao') relogioVinculo = 'relogio1_producao';
    else if (deptId === 'dept-admin') relogioVinculo = 'relogio2_adm';
    else relogioVinculo = 'relogio1_producao';
  }

  // Se ID não existir ou for formato legado 'colab-123' (sem filial), gera com escopo de filial
  let targetId = c.id;
  if (!targetId || targetId.startsWith('colab-')) {
    targetId = generateColaboradorId(filialId, crachaFinal);
  }

  return {
    ...c,
    id: targetId,
    cracha: crachaFinal,
    nome: nome,
    filialId: filialId,
    deptId: deptId,
    admissao: admissao,
    aprendiz: isAp,
    trabalhaSabado: trabalhaSabado,
    naoRecebeVa: naoRecebeVa,
    recebeVa: !naoRecebeVa,
    registraPonto: registraPonto,
    status: (c.status === 'demitido' || c.isDemitido) ? 'demitido' : 'ativo',
    dataDemissao: c.dataDemissao || '',
    relogioVinculo: relogioVinculo,
    cargo: c.cargo || '',
    cpf: c.cpf || '',
    pis: c.pis || '',
    idregistro: c.idregistro || c.idregistroNG || null,
    idowner: c.idowner || c.idownerNG || null,
    quadroNG: c.quadroNG || '',
    horariosSemana: c.horariosSemana || null
  };
}

/**
 * Normaliza e preserva todos os departamentos da empresa, garantindo ADMIN-S/PONTO
 * e prevenindo que departamentos novos criados pelo usuário sejam perdidos.
 */

/**
 * Migra o estado global da aplicação para a arquitetura de IDs escopados por filial.
 * Garante que homônimos de crachá (ex: Fernanda crachá 361 na Matriz e Mayck crachá 361 na Distribuidora)
 * tenham bancos/chaves de registros de ponto totalmente isolados e livres de bugs.
 */
function migrateAppState(state) {
  if (!state || !Array.isArray(state.colaboradores) || state.colaboradores.length === 0) return state;

  const colabs = state.colaboradores;
  const oldRp = state.registrosPonto || {};
  const newRp = {};
  const idMap = new Map();
  let hasChanges = false;

  const updatedColabs = colabs.map(c => {
    let filialId = c.filialId || 'branch-1';
    let cracha = Number(c.cracha);
    let admissao = c.admissao;
    let nome = (c.nome || '').trim();
    let deptId = c.deptId || 'dept-admin';

    if (nome.includes('FERNANDA CRISTINA PAIXAO DE ALMEIDA')) {
      if (cracha !== 361 || admissao !== '2020-02-12' || filialId !== 'branch-1' || c.id !== 'colab_branch-1_361') hasChanges = true;
      filialId = 'branch-1';
      cracha = 361;
      admissao = '2020-02-12';
      deptId = 'dept-admin';
    } else if (nome.includes('MAYCK CANDIDO DE JESUS')) {
      if (cracha !== 361 || filialId !== 'branch-3' || c.id !== 'colab_branch-3_361') hasChanges = true;
      filialId = 'branch-3';
      cracha = 361;
      admissao = '2026-08-27';
      deptId = 'dept-deposito';
    } else if (nome.includes('GILMAR SABINO DA SILVA')) {
      filialId = 'branch-1'; cracha = 234; admissao = '2014-05-07'; deptId = 'dept-producao';
    } else if (nome.includes('BRUNO WINICIUS DE SOUZA')) {
      filialId = 'branch-3'; cracha = 234; admissao = '2020-07-16'; deptId = 'dept-admin';
    } else if (nome.includes('CLAUDINEI RIBEIRO FERNANDES')) {
      filialId = 'branch-1'; cracha = 336; admissao = '2019-09-20'; deptId = 'dept-admin-sponto';
    } else if (nome.includes('JHONATAN JULIO DA SILVA REIS')) {
      filialId = 'branch-3'; cracha = 336; admissao = '2025-10-07'; deptId = 'dept-deposito';
    }

    const expectedId = generateColaboradorId(filialId, cracha);
    if (c.id !== expectedId) {
      hasChanges = true;
      idMap.set(c.id + '__' + filialId, expectedId);
      if (!idMap.has(c.id)) {
        idMap.set(c.id, expectedId);
      }
    }

    return {
      ...c,
      id: expectedId,
      cracha,
      nome,
      filialId,
      deptId,
      admissao
    };
  });

  // Re-mapear registros de ponto legados com preservação integral de dados
  Object.keys(oldRp).forEach(k => {
    const lastUnderscore = k.lastIndexOf('_');
    if (lastUnderscore === -1) {
      newRp[k] = oldRp[k];
      return;
    }
    const oldId = k.substring(0, lastUnderscore);
    const dateStr = k.substring(lastUnderscore + 1);

    let targetNewId = oldId;
    if (oldId === 'colab-234') {
      targetNewId = 'colab_branch-1_234';
      hasChanges = true;
    } else if (oldId === 'colab-336') {
      targetNewId = 'colab_branch-1_336';
      hasChanges = true;
    } else if (oldId === 'colab-361') {
      targetNewId = 'colab_branch-1_361';
      hasChanges = true;
    } else if (oldId.startsWith('colab-')) {
      targetNewId = idMap.get(oldId);
      if (!targetNewId) {
        const crachaFromId = Number(oldId.replace('colab-', ''));
        const found = updatedColabs.find(c => c.cracha === crachaFromId);
        targetNewId = found ? found.id : oldId;
      }
      if (targetNewId !== oldId) hasChanges = true;
    }

    const targetKey = `${targetNewId}_${dateStr}`;
    const incomingItem = oldRp[k];
    const existingItem = newRp[targetKey];

    if (!existingItem) {
      newRp[targetKey] = incomingItem;
    } else {
      const existingHasPunches = existingItem.punches && Object.values(existingItem.punches).some(p => !!p);
      const incomingHasPunches = incomingItem.punches && Object.values(incomingItem.punches).some(p => !!p);
      const existingHasOverride = existingItem.override && existingItem.override !== 'VAZIO';
      const incomingHasOverride = incomingItem.override && incomingItem.override !== 'VAZIO';

      let chosen = existingItem;
      if (!existingHasPunches && incomingHasPunches) {
        chosen = incomingItem;
      } else if (!existingHasOverride && incomingHasOverride) {
        chosen = incomingItem;
      }
      newRp[targetKey] = { ...existingItem, ...incomingItem, ...chosen };
    }

    // Preserva a chave original também para compatibilidade e resiliência total
    if (!newRp[k]) {
      newRp[k] = oldRp[k];
    }
  });

  // Re-mapear avisos
  const updatedAvisos = (state.avisos || []).map(a => {
    let colabId = a.colabId;
    if (colabId && (colabId.startsWith('colab-') || colabId === 'colab-361')) {
      if (colabId === 'colab-361') colabId = 'colab_branch-1_361';
      else if (colabId === 'colab-234') colabId = 'colab_branch-1_234';
      else if (colabId === 'colab-336') colabId = 'colab_branch-1_336';
      else if (idMap.has(colabId)) colabId = idMap.get(colabId);
      else {
        const crachaFromId = Number(colabId.replace('colab-', ''));
        const found = updatedColabs.find(c => c.cracha === crachaFromId);
        if (found) colabId = found.id;
      }
      hasChanges = true;
    }
    return { ...a, colabId };
  });

  // Tratamento de registros com override VAZIO (garante batidas limpas e preserva status VAZIO)
  Object.keys(newRp).forEach(k => {
    const reg = newRp[k];
    if (reg && reg.override === 'VAZIO') {
      const isMassOk = reg.note && reg.note.includes('OK em massa');
      if (isMassOk) {
        reg.override = 'OK';
        hasChanges = true;
      } else if (reg.punches && (reg.punches.em || reg.punches.sm || reg.punches.et || reg.punches.st)) {
        reg.punches = { em: '', sm: '', et: '', st: '' };
        hasChanges = true;
      }
    }
  });

  state.colaboradores = updatedColabs;
  state.registrosPonto = newRp;
  state.avisos = updatedAvisos;

  return state;
}

function normalizeDepartamentos(depts) {
  const seedDepts = getDefaultSeedData().departamentos;
  const map = new Map();

  seedDepts.forEach(d => map.set(d.id, { id: d.id, nome: d.nome }));

  if (Array.isArray(depts)) {
    depts.forEach(d => {
      if (!d || !d.nome) return;
      let id = d.id;
      let nome = d.nome.trim();

      if (id === 'dept-1792071704664' || nome.toUpperCase() === 'ADMIN-S/PONTO') {
        id = 'dept-admin-sponto';
        nome = 'ADMIN-S/PONTO';
      }
      map.set(id, { id, nome });
    });
  }

  if (!map.has('dept-admin-sponto')) {
    map.set('dept-admin-sponto', { id: 'dept-admin-sponto', nome: 'ADMIN-S/PONTO' });
  }

  return Array.from(map.values());
}

// ==========================================================================
// MOTOR DE PERSISTÊNCIA, BACKUP AUTOMÁTICO E PROTEÇÃO CONTRA PERDA DE DADOS
// ==========================================================================

const BACKUP_HISTORY_KEY = 'appLucas_backup_history_v1';
const MODAL_DRAFT_KEY = 'appLucas_modal_draft_v1';
const CLOSE_PROTECTION_KEY = 'appLucas_close_protection';
const MAX_BACKUP_SNAPSHOTS = 50;

/**
 * Retorna o payload completo e normalizado do estado da aplicação
 */
function getStoragePayload() {
  return {
    _masterVersion: MASTER_RECOVERY_VERSION,
    filiais: appState.filiais || [],
    departamentos: normalizeDepartamentos(appState.departamentos || []),
    colaboradores: (appState.colaboradores || []).map(normalizeColaborador),
    feriados: appState.feriados || [],
    avisos: appState.avisos || [],
    registrosPonto: appState.registrosPonto || {},
    carryOverDsr: appState.carryOverDsr || {},
    activeBranchId: appState.activeBranchId || 'branch-1',
    currentYear: typeof appState.currentYear === 'number' ? appState.currentYear : 2026,
    currentMonth: typeof appState.currentMonth === 'number' ? appState.currentMonth : 9,
    statusFilter: appState.statusFilter || 'ativos',
    departmentFilter: appState.departmentFilter || 'todos',
    calFilterDept: appState.calFilterDept || 'todos',
    focusMode: !!appState.focusMode,
    sortBy: appState.sortBy || 'cracha',
    updatedAt: appState.updatedAt || new Date().toISOString()
  };
}

/**
 * Salva dados no LocalStorage e Sincroniza com a Nuvem Supabase
 * Sistema Blindado contra Perda de Dados e Corrupção
 * @param {boolean} syncCloud Se deve disparar envio para o Supabase
 * @param {boolean} immediateCloud Se deve enviar sem debounce (padrão true em ações do usuário)
 * @param {boolean} isUserAction Se é uma alteração real do usuário
 */
function saveStateToStorage(syncCloud = true, immediateCloud = true, isUserAction = true) {
  try {
    if (isUserAction) {
      appState.updatedAt = new Date().toISOString();
    }
    const payload = getStoragePayload();

    // 1. Validação Estrutural Anti-Corrupção: Protege contra objetos vazios ou corrompidos
    if (!payload || !Array.isArray(payload.colaboradores) || payload.colaboradores.length < 5) {
      console.warn('PROTEÇÃO ATIVA: Tentativa de salvar estado corrompido ou sem colaboradores bloqueada.');
      return;
    }

    const jsonStr = JSON.stringify(payload);

    // 2. Gravação Atômica com Espelho de Segurança no LocalStorage
    try {
      const anterior = localStorage.getItem(STORAGE_KEY);
      if (anterior && anterior.length > 500) {
        localStorage.setItem(STORAGE_KEY + '_backup', anterior);
      }
      localStorage.setItem(STORAGE_KEY, jsonStr);
    } catch (eStorage) {
      console.error('Erro de cota ou escrita no localStorage:', eStorage);
    }

    // 3. Propaga imediatamente para qualquer outra aba aberta no mesmo navegador
    if (syncBroadcastChannel) {
      try {
        syncBroadcastChannel.postMessage({ type: 'STATE_UPDATED', payload });
      } catch (errPost) {
        console.warn('Erro ao disparar BroadcastChannel:', errPost);
      }
    }

    // 4. Espelho de Persistência Local no Disco (Servidor Local / Zero Cloud / Offline Safe)
    if (typeof fetch === 'function') {
      try {
        fetch(`${API_BASE}/api/salvar-estado-local`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload })
        }).catch(() => {});
      } catch (eLocalDb) {}
    }

    // 5. Sincronização Imediata com a Nuvem Supabase
    if (syncCloud && supabaseClient) {
      triggerCloudSync(payload, immediateCloud);
    }
  } catch (err) {
    console.error('Falha geral ao salvar no localStorage:', err);
  }
}

let cloudSyncTimer = null;
let cloudSyncRetries = 0;
const MAX_CLOUD_RETRIES = 5;

function triggerCloudSync(payload, immediate = true) {
  if (!supabaseClient) return;
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);

  const performSync = async () => {
    const badge = document.getElementById('supabase-sync-badge');
    try {
      if (badge) {
        badge.style.opacity = '0.6';
        badge.title = 'Salvando alterações na nuvem...';
      }

      payload.updatedAt = payload.updatedAt || new Date().toISOString();

      // 1. Gravação Principal no Supabase
      const { error } = await supabaseClient
        .from('config_app')
        .upsert({ id: 'latest_state', data: payload, updated_at: payload.updatedAt });

      if (error) throw error;

      cloudSyncRetries = 0;
      if (badge) {
        badge.style.opacity = '1';
        badge.title = 'Salvo e sincronizado na nuvem: ' + new Date().toLocaleTimeString();
      }
      console.log('Nuvem Supabase atualizada com sucesso.');

      // 2. Snapshot de Segurança Histórico no Supabase (backup diário resiliente)
      const hojeKey = 'backup_' + new Date().toISOString().slice(0, 10);
      const ultimoBackupIso = localStorage.getItem('ponto_ultimo_backup_diario_iso');
      if (ultimoBackupIso !== hojeKey) {
        localStorage.setItem('ponto_ultimo_backup_diario_iso', hojeKey);
        supabaseClient.from('config_app').upsert({
          id: hojeKey,
          data: payload,
          updated_at: new Date().toISOString()
        }).then(() => console.log('Snapshot diário salvo na nuvem:', hojeKey)).catch(() => {});
      }
    } catch (e) {
      console.warn('Erro na sincronização em nuvem:', e);
      if (badge) {
        badge.style.opacity = '1';
        badge.title = 'Erro de rede na nuvem - tentativa em fila...';
      }
      // Fila de Retentativa Automática com Backoff Exponencial
      if (cloudSyncRetries < MAX_CLOUD_RETRIES) {
        cloudSyncRetries++;
        const delay = Math.min(1000 * Math.pow(2, cloudSyncRetries), 15000);
        console.log(`Reagendando sincronização em nuvem (tentativa ${cloudSyncRetries}/${MAX_CLOUD_RETRIES}) em ${delay}ms...`);
        cloudSyncTimer = setTimeout(performSync, delay);
      }
    }
  };

  if (immediate) {
    performSync();
  } else {
    cloudSyncTimer = setTimeout(performSync, 100);
  }
}

/**
 * Envio síncrono/keepalive para o Supabase durante o descarregamento da página (beforeunload / unload)
 */
function sendKeepaliveCloudSync(payload) {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    const url = `${SUPABASE_URL}/rest/v1/config_app?on_conflict=id`;
    const body = JSON.stringify({
      id: 'latest_state',
      data: payload,
      updated_at: payload.updatedAt || new Date().toISOString()
    });
    fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: body,
      keepalive: true
    }).catch(() => {});
  } catch (e) {}
}

/**
 * Backups automáticos locais desativados a pedido do usuário.
 * O backup agora é gerado sob demanda via download de arquivo JSON no botão "Baixar Backup".
 */
function createAutoBackupSnapshot() {
  // Desativado a pedido do usuário
}

// Salvamento automático de snapshots foi desativado a pedido do usuário
function scheduleAutoBackup(payload) {
  // no-op: backups no histórico agora são criados sob demanda manual
}

/**
 * Rascunho de Modais Ativos (salva o que estava sendo preenchido caso a aba feche)
 */
function saveActiveModalDraft() {
  try {
    const activeModal = document.querySelector('.modal-overlay.active');
    if (!activeModal) return null;

    const modalId = activeModal.id;
    let draft = { modalId, timestamp: new Date().toISOString(), data: {} };

    if (modalId === 'modal-cell-detail') {
      const { colabId, isoDate } = currentEditingCell || {};
      if (!colabId || !isoDate) return null;

      draft.colabId = colabId;
      draft.isoDate = isoDate;
      const punches = {
        em: document.getElementById('punch-em')?.value || '',
        sm: document.getElementById('punch-sm')?.value || '',
        et: document.getElementById('punch-et')?.value || '',
        st: document.getElementById('punch-st')?.value || ''
      };
      const override = document.getElementById('select-override-status')?.value || 'AUTO';
      const override2 = document.getElementById('select-override-status-2')?.value || '';
      const resolution = document.getElementById('select-resolution')?.value || 'NENHUMA';
      const colabDraft = appState.colaboradores.find(c => c.id === colabId);
      const branchId = colabDraft?.filialId || appState.activeBranchId;
      const isHol = isHoliday(isoDate, branchId);

      const note = (document.getElementById('input-cell-justificativa')?.value || '').trim();
      let atrasoMaior = normalizeTimeInput((document.getElementById('input-atraso-maior')?.value || '').trim());
      let atrasoPequeno = normalizeTimeInput((document.getElementById('input-atraso-pequeno')?.value || '').trim());

      if (override === 'VAZIO') {
        punches.em = '';
        punches.sm = '';
        punches.et = '';
        punches.st = '';
        atrasoMaior = '';
        atrasoPequeno = '';
      } else if (override === 'OK') {
        atrasoMaior = '';
        atrasoPequeno = '';
      } else if (override === 'AUTO') {
        const dw = (new Date(isoDate + 'T12:00:00')).getDay() + 1;
        const colabSchedule = colabDraft?.horariosSemana ? (colabDraft.horariosSemana[dw] || colabDraft.horariosSemana[String(dw)]) : (colabDraft?.quadroNG || null);
        const evalRes = evaluateDailyPunches(punches, colabSchedule);
        if (evalRes.status === 'ATRASO' && evalRes.delayMinutes > 0) {
          atrasoMaior = minutesToTime(evalRes.delayMinutes);
        } else {
          atrasoMaior = '';
        }
      }

      draft.data = { punches, override, override2, resolution, note, atrasoMaior, atrasoPequeno };

      // Se não for feriado, salva no próprio registrosPonto em memória para não perder o que foi digitado!
      if (!isHol) {
        const regKey = colabId + '_' + isoDate;
        appState.registrosPonto[regKey] = {
          override,
          override2,
          resolution,
          punches: { ...punches },
          note,
          atrasoMaior,
          atrasoMaiorMin: parseTimeToMinutes(atrasoMaior),
          atrasoPequeno,
          atrasoPequenoMin: parseTimeToMinutes(atrasoPequeno)
        };
      }
    } else if (modalId === 'modal-employee') {
      draft.data = {
        id: document.getElementById('emp-id')?.value,
        cracha: document.getElementById('emp-cracha')?.value,
        nome: document.getElementById('emp-nome')?.value,
        filialId: document.getElementById('emp-filial')?.value,
        deptId: document.getElementById('emp-dept')?.value,
        admissao: document.getElementById('emp-admissao')?.value,
        registraPonto: document.getElementById('emp-registra-ponto')?.checked,
        aprendiz: document.getElementById('emp-aprendiz')?.checked,
        folgaSabado: document.getElementById('emp-folga-sabado')?.checked,
        naoRecebeVa: document.getElementById('emp-nao-recebe-va')?.checked,
        status: document.getElementById('emp-status')?.value,
        dataDemissao: document.getElementById('emp-demissao')?.value
      };
    } else if (modalId === 'modal-aviso') {
      draft.data = {
        id: document.getElementById('aviso-id')?.value,
        titulo: document.getElementById('aviso-titulo')?.value,
        data: document.getElementById('aviso-data')?.value,
        tipo: document.getElementById('aviso-tipo')?.value,
        descricao: document.getElementById('aviso-desc')?.value,
        filialId: document.getElementById('aviso-filial')?.value
      };
    }

    localStorage.setItem(MODAL_DRAFT_KEY, JSON.stringify(draft));
    return draft;
  } catch (e) {
    console.warn('Erro ao salvar rascunho de modal:', e);
    return null;
  }
}

function clearModalDraft() {
  try {
    localStorage.removeItem(MODAL_DRAFT_KEY);
  } catch (e) {}
}

function checkModalDraftOnLoad() {
  try {
    const raw = localStorage.getItem(MODAL_DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (!draft || !draft.timestamp) return;

    const diffHours = (Date.now() - new Date(draft.timestamp).getTime()) / (1000 * 60 * 60);
    if (diffHours > 24) {
      clearModalDraft();
      return;
    }

    let itemDesc = 'registro em andamento';
    if (draft.modalId === 'modal-cell-detail') itemDesc = 'ponto do colaborador';
    if (draft.modalId === 'modal-employee') itemDesc = 'cadastro de colaborador (' + (draft.data?.nome || 'novo') + ')';
    if (draft.modalId === 'modal-aviso') itemDesc = 'aviso (' + (draft.data?.titulo || 'novo') + ')';

    showToast(`📝 Alterações salvas com segurança antes do fechamento (${itemDesc})!`, 'purple');
    clearModalDraft();
  } catch (e) {}
}

/**
 * Controle de Proteção contra Fechamento Acidental da Aba
 */
function isTabCloseProtectionActive() {
  const setting = localStorage.getItem(CLOSE_PROTECTION_KEY);
  return setting !== 'false'; // ATIVADA POR PADRÃO
}

function setTabCloseProtection(enabled) {
  localStorage.setItem(CLOSE_PROTECTION_KEY, enabled ? 'true' : 'false');
  const toggle = document.getElementById('toggle-close-protection');
  if (toggle) toggle.checked = enabled;
}

// Histórico e modal de snapshots removidos a pedido do usuário (backup via download JSON sob demanda)

function normalizeAviso(a) {
  const idStr = String(a.id || '');
  const isAssin = idStr.startsWith('aviso-assinatura-');
  return {
    ...a,
    isAssinaturaDoc: a.isAssinaturaDoc === true || isAssin,
    autoRollover: a.autoRollover === true || isAssin,
    id: a.id || ('aviso-' + Math.random().toString(36).substr(2, 9)),
    data: a.data || (a.createdAt ? a.createdAt.split('T')[0] : '2026-10-15'),
    titulo: a.titulo || 'Prazo Legal CLT',
    tipo: a.tipo || (a.categoria === 'urgente' ? 'rescisao' : 'outros'),
    descricao: a.descricao || a.conteudo || '',
    filialId: a.filialId || 'TODAS',
    colabId: a.colabId || '',
    concluido: !!a.concluido,
    concluidoEm: a.concluidoEm || null,
    createdAt: a.createdAt || new Date().toISOString()
  };
}

/**
 * Aplica estado recebido remotamente (de outra aba ou da nuvem Supabase)
 * com proteção estrita para não regredir se os dados forem mais antigos que os locais.
 */
function applyRemoteState(incoming, force = false) {
  if (!incoming) return;
  incoming = migrateAppState(incoming);

  if (!force && incoming.updatedAt && appState.updatedAt) {
    const inTime = new Date(incoming.updatedAt).getTime();
    const curTime = new Date(appState.updatedAt).getTime();
    if (inTime < curTime) {
      console.log('Ignorando atualização remota desatualizada:', inTime, '<', curTime);
      return;
    }
  }

  if (Array.isArray(incoming.filiais) && incoming.filiais.length > 0) {
    appState.filiais = incoming.filiais;
  }
  if (Array.isArray(incoming.departamentos) && incoming.departamentos.length > 0) {
    appState.departamentos = normalizeDepartamentos(incoming.departamentos);
  }
  if (Array.isArray(incoming.colaboradores) && incoming.colaboradores.length > 0) {
    appState.colaboradores = incoming.colaboradores.map(normalizeColaborador);
  }
  if (Array.isArray(incoming.feriados)) {
    appState.feriados = incoming.feriados;
  }
  if (Array.isArray(incoming.avisos)) {
    appState.avisos = incoming.avisos.map(normalizeAviso);
  }
  if (incoming.registrosPonto && typeof incoming.registrosPonto === 'object') {
    const incCount = Object.keys(incoming.registrosPonto).length;
    const curCount = Object.keys(appState.registrosPonto || {}).length;

    // Se o estado atual tiver registros substanciais e o recebido for vazio ou insignificante, JAMAIS esvaziar!
    if (curCount > 100 && incCount < 100) {
      console.warn(`PROTEÇÃO ATIVA: Ignorando tentativa remota de esvaziar batidas (${curCount} locais vs ${incCount} recebidas).`);
    } else if (force) {
      // Restauração forçada: substituição total e limpa pela base oficial
      appState.registrosPonto = JSON.parse(JSON.stringify(incoming.registrosPonto || {}));
    } else {
      // Mescla inteligente: une os registros locais e remotos, preservando batidas preenchidas
      const merged = { ...appState.registrosPonto, ...incoming.registrosPonto };
      Object.keys(appState.registrosPonto || {}).forEach(k => {
        const localItem = appState.registrosPonto[k];
        const remoteItem = incoming.registrosPonto[k];
        if (localItem && remoteItem) {
          const localHasPunches = localItem.punches && Object.values(localItem.punches).some(p => !!p);
          const remoteHasPunches = remoteItem.punches && Object.values(remoteItem.punches).some(p => !!p);
          if (localHasPunches && !remoteHasPunches) {
            merged[k] = localItem;
          }
        }
      });
      appState.registrosPonto = merged;
    }
  }

  if (incoming.activeBranchId && appState.filiais && appState.filiais.some(f => f.id === incoming.activeBranchId)) {
    if (force || !appState.activeBranchId) {
      appState.activeBranchId = incoming.activeBranchId;
    }
  }

  if (incoming.updatedAt) {
    appState.updatedAt = incoming.updatedAt;
  }

  renderCurrentView();
}

// Ouvinte do BroadcastChannel para sincronização instantânea entre abas
if (syncBroadcastChannel) {
  syncBroadcastChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'STATE_UPDATED' && event.data.payload) {
      applyRemoteState(event.data.payload);
    }
  };
}

// Ouvintes de ciclo de vida da janela (Fechamento, Troca de Aba, etc.)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        applyRemoteState(parsed);
      } catch (e) {
        console.warn('Erro ao processar sincronização de storage:', e);
      }
    }
  });

  // Salva imediatamente ao fechar/sair e ativa confirmação de segurança
  window.addEventListener('beforeunload', (event) => {
    try {
      saveActiveModalDraft();
      saveStateToStorage(false, false, false);
      createAutoBackupSnapshot('Fechamento de Aba');

      const payload = getStoragePayload();
      sendKeepaliveCloudSync(payload);
    } catch (e) {}

    const hasModal = !!document.querySelector('.modal-overlay.active');
    const protection = isTabCloseProtectionActive();

    // Se houver proteção ativada ou modal aberto, aciona a confirmação nativa do navegador
    if (protection || hasModal) {
      event.preventDefault();
      event.returnValue = '';
      return '';
    }
  });

  // Sincroniza em segundo plano quando o usuário minimiza ou troca de aba
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      try {
        saveActiveModalDraft();
        saveStateToStorage(false, false, false);
        const payload = getStoragePayload();
        sendKeepaliveCloudSync(payload);
      } catch (e) {}
    }
  });
}

/**
 * Sincroniza em tempo real com o Supabase Cloud caso outro dispositivo/navegador faça alterações
 */
function initSupabaseRealtime() {
  if (!supabaseClient) return;
  try {
    supabaseClient
      .channel('public:config_app_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'config_app', filter: 'id=eq.latest_state' }, (changePayload) => {
        if (changePayload.new && changePayload.new.data) {
          console.log('Atualização em tempo real recebida do Supabase Cloud');
          applyRemoteState(changePayload.new.data);
          saveStateToStorage(false, false, false);
          const badge = document.getElementById('supabase-sync-badge');
          if (badge) {
            badge.style.opacity = '1';
            badge.title = 'Nuvem Atualizada: ' + new Date().toLocaleTimeString();
          }
        }
      })
      .subscribe();
  } catch (e) {
    console.warn('Supabase Realtime não pôde ser inicializado:', e);
  }
}

/**
 * Sincronização na inicialização com comparação segura de timestamps
 */
async function syncFromCloudOnStart() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('config_app')
      .select('data, updated_at')
      .eq('id', 'latest_state')
      .maybeSingle();

    if (error) {
      console.warn('Erro ao consultar Supabase Cloud:', error);
      return;
    }

    if (data && data.data) {
      const cloud = data.data;
      const cloudVersion = Number(cloud._masterVersion) || 0;
      const localVersion = Number(appState._masterVersion) || 0;
      const cloudTime = new Date(data.updated_at || cloud.updatedAt || 0).getTime();
      const localTime = new Date(appState.updatedAt || 0).getTime();

      const cloudPontoCount = Object.keys(cloud.registrosPonto || {}).length;
      const localPontoCount = Object.keys(appState.registrosPonto || {}).length;

      console.log('Verificação de Sincronização na Inicialização:');
      console.log(` - Nuvem: v:${cloudVersion}, batidas:${cloudPontoCount}, time:${new Date(cloudTime).toISOString()}`);
      console.log(` - Local: v:${localVersion}, batidas:${localPontoCount}, time:${new Date(localTime).toISOString()}`);

      // Bloqueio de downgrade se a nuvem tiver versão mestra anterior à oficial
      if (cloudVersion < MASTER_RECOVERY_VERSION) {
        console.warn(`Nuvem possui versão defasada (v${cloudVersion} < v${MASTER_RECOVERY_VERSION}). Atualizando nuvem com a Base Mestra Oficial...`);
        saveStateToStorage(true, true, true);
        return;
      }

      // SMART MERGE: Mesclagem inteligente de batidas para NUNCA perder nenhuma alteração
      if (cloud.registrosPonto && typeof cloud.registrosPonto === 'object') {
        const mergedPontos = Object.assign({}, cloud.registrosPonto, appState.registrosPonto);
        appState.registrosPonto = mergedPontos;
      }

      // Se a nuvem for mais recente no tempo, atualiza estrutura mantendo os pontos mesclados
      if (cloudTime > localTime && Array.isArray(cloud.colaboradores) && cloud.colaboradores.length >= 10) {
        console.log(`Nuvem mais recente (${new Date(cloudTime).toLocaleTimeString()}). Atualizando dados locais...`);
        applyRemoteState(cloud, false);
        appState.updatedAt = new Date(cloudTime).toISOString();
        saveStateToStorage(false, false, false);
        renderCurrentView();
      } else if (localTime > cloudTime && Array.isArray(appState.colaboradores) && appState.colaboradores.length >= 10) {
        console.log(`Local possui alterações mais recentes (${new Date(localTime).toLocaleTimeString()}). Sincronizando com a nuvem...`);
        const payload = getStoragePayload();
        triggerCloudSync(payload, true);
      }

      console.log('Nuvem e local estão sincronizados e com dados mesclados.');
    }
  } catch (e) {
    console.warn('Falha ao sincronizar da nuvem:', e);
  }
}

// Carregar dados locais na inicialização com Proteção Total contra Perda de Dados
function loadStateFromStorage() {
  try {
    const masterSource = (typeof window !== 'undefined') ? (window.GOLD_RECOVERY_DATA || window.BACKUP_DATA) : null;
    let raw = localStorage.getItem(STORAGE_KEY);
    let parsed = null;

    if (raw) {
      try { parsed = JSON.parse(raw); } catch (e) { console.error('Erro ao decodificar JSON do storage:', e); }
    }

    // Se o primário falhou ou está vazio, tenta recuperar do Espelho de Segurança (_backup)
    if (!parsed || !parsed.colaboradores || parsed.colaboradores.length < 5) {
      const backupRaw = localStorage.getItem(STORAGE_KEY + '_backup');
      if (backupRaw) {
        try {
          const bParsed = JSON.parse(backupRaw);
          if (bParsed && Array.isArray(bParsed.colaboradores) && bParsed.colaboradores.length >= 5) {
            console.log('✅ Recuperado com sucesso a partir do Espelho de Segurança local (_backup)!');
            parsed = bParsed;
          }
        } catch (eBkp) {}
      }
    }

    // Se a versão da Base Mestra Oficial embutida no sistema for mais recente que o cache local do cliente,
    // atualiza o estado local com os registros consolidados da Base Mestra Oficial
    if (parsed && masterSource && Number(parsed._masterVersion || 0) < MASTER_RECOVERY_VERSION) {
      console.log(`🚀 Atualizando cache local da Base Mestra Oficial: v${parsed._masterVersion} -> v${MASTER_RECOVERY_VERSION}`);
      parsed = JSON.parse(JSON.stringify(masterSource));
      parsed._masterVersion = MASTER_RECOVERY_VERSION;
      parsed.updatedAt = new Date().toISOString();
      parsed = migrateAppState(parsed);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch (e) {}
    }

    // Apenas aplica o seed inicial se o banco local estiver realmente inexistente ou sem colaboradores
    if (!parsed || !parsed.colaboradores || parsed.colaboradores.length < 5) {
      if (masterSource) {
        console.warn('Banco local virgem/vazio. Inicializando com Base Mestra...');
        parsed = JSON.parse(JSON.stringify(masterSource));
        parsed._masterVersion = MASTER_RECOVERY_VERSION;
        parsed.updatedAt = new Date().toISOString();
        parsed = migrateAppState(parsed);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }
    }

    if (parsed) {
      if (parsed.filiais && parsed.filiais.length > 0 && parsed.colaboradores && parsed.colaboradores.length > 0) {
        appState._masterVersion = Number(parsed._masterVersion) || MASTER_RECOVERY_VERSION;
        appState.filiais = parsed.filiais;
        appState.departamentos = normalizeDepartamentos(parsed.departamentos);
        appState.colaboradores = (parsed.colaboradores || []).map(normalizeColaborador);
        appState.feriados = parsed.feriados || [];

        const rawAvisos = (parsed.avisos && Array.isArray(parsed.avisos) && parsed.avisos.length > 0)
          ? parsed.avisos
          : getDefaultSeedData().avisos;
        const hasCalendarDates = rawAvisos.some(a => !!a.data);
        appState.avisos = hasCalendarDates ? rawAvisos.map(normalizeAviso) : getDefaultSeedData().avisos;

        appState.registrosPonto = parsed.registrosPonto || {};
        appState.carryOverDsr = parsed.carryOverDsr || {};

        if (parsed.activeBranchId && appState.filiais.some(f => f.id === parsed.activeBranchId)) {
          if (parsed.activeBranchId === 'branch-4' && localPontosCount < 100) {
            appState.activeBranchId = 'branch-1';
          } else {
            appState.activeBranchId = parsed.activeBranchId;
          }
        } else {
          appState.activeBranchId = appState.filiais[0].id;
        }

        // Correção cadastral para o colaborador Wesley Patrick (crachá 1034 - admitido 09/10/2026)
        const wesley = appState.colaboradores.find(c => Number(c.cracha) === 1034 || (c.id === 'colab-1034' || c.id === 'colab_branch-1_1034'));
        if (wesley) {
          wesley.status = 'ativo';
          wesley.admissao = '2026-10-09';
          wesley.dataDemissao = '';
        }
        if (appState.avisos && Array.isArray(appState.avisos)) {
          appState.avisos = appState.avisos.filter(a => {
            const isWesley = (a.colabId === 'colab-1034' || a.colabId === 'colab_branch-1_1034') || (a.titulo && a.titulo.toLowerCase().includes('wesley'));
            return !(isWesley && a.tipo === 'rescisao');
          });
          const hasWesleyAviso = appState.avisos.some(a => a.id === 'aviso-admissao-wesley');
          if (!hasWesleyAviso) {
            appState.avisos.push({
              id: "aviso-admissao-wesley",
              data: "2026-10-09",
              titulo: "🟢 Admissão Concluída - Wesley Patrick (Início de Atividades)",
              tipo: "outros",
              descricao: "Admissão e início oficial de atividades do colaborador Wesley Patrick Fernandes de Oliveira no setor de Produção.",
              filialId: "branch-1",
              colabId: "colab-1034",
              concluido: true,
              concluidoEm: "2026-10-09T08:00:00Z",
              createdAt: "2026-10-09T08:00:00Z"
            });
          }
          const pontoAviso = appState.avisos.find(a => a.tipo === 'ponto' && a.id === 'aviso-ponto-1');
          if (pontoAviso) {
            pontoAviso.data = '2026-10-31';
            pontoAviso.titulo = '🔵 Fechamento de Ponto & VA (Último Dia Útil do Mês - Sábado)';
          }
        }

        if (typeof parsed.currentYear === 'number') appState.currentYear = parsed.currentYear;
        if (typeof parsed.currentMonth === 'number') appState.currentMonth = parsed.currentMonth;
        if (parsed.statusFilter) appState.statusFilter = parsed.statusFilter;
        if (parsed.departmentFilter) appState.departmentFilter = parsed.departmentFilter;
        if (parsed.calFilterDept) appState.calFilterDept = parsed.calFilterDept;
        if (typeof parsed.focusMode === 'boolean') appState.focusMode = parsed.focusMode;
        if (parsed.sortBy) appState.sortBy = parsed.sortBy;

        appState.updatedAt = parsed.updatedAt || new Date().toISOString();

        checkAndRolloverPendingNotices();
        syncDismissalNotices();

        // Salva apenas localmente; não atualiza timestamp nem sobrescreve a nuvem
        saveStateToStorage(false, false, false);
        return;
      }
    }
  } catch (err) {
    console.warn('Erro ao ler do storage, carregando seed real:', err);
  }

  // Se não existir dados ou forem antigos/inválidos, carrega GOLD_RECOVERY_DATA ou a base padrão
  const seed = (typeof window !== 'undefined' && window.GOLD_RECOVERY_DATA)
    ? migrateAppState(window.GOLD_RECOVERY_DATA)
    : getDefaultSeedData();
  appState.filiais = seed.filiais;
  appState.departamentos = normalizeDepartamentos(seed.departamentos);
  appState.colaboradores = (seed.colaboradores || []).map(normalizeColaborador);
  appState.feriados = seed.feriados;
  appState.avisos = seed.avisos;
  appState.registrosPonto = seed.registrosPonto;
  appState.carryOverDsr = {};
  appState.activeBranchId = 'branch-1';
  // Marca com timestamp antigo para que se houver dados reais na nuvem, ela prevaleça
  appState.updatedAt = '1970-01-01T00:00:00.000Z';

  checkAndRolloverPendingNotices();
  syncDismissalNotices();

  // Salva apenas localmente
  saveStateToStorage(false, false, false);
}


// ==========================================================================
// 3. UTILITÁRIOS DE DATA E REGRAS DE PONTO
// ==========================================================================
const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const DIAS_SEMANA_SIGLA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function formatDateISO(year, month, day) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return year + '-' + m + '-' + d;
}

function formatDateBR(isoStr) {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length < 3) return isoStr;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

/**
 * Determina se o colaborador tem folga fixa aos sábados (não trabalha aos sábados)
 * Válido para Aprendizes sem sábado ou qualquer colaborador com trabalhaSabado: false
 */
function isColabFolgaSabado(colab) {
  if (!colab) return false;
  // Se explicitamente configurado como NÃO trabalha no sábado
  if (colab.trabalhaSabado === false || colab.trabalhaSabado === 'nao' || colab.trabalhaSabado === 0) {
    return true;
  }
  // Se for aprendiz e não estiver explicitamente marcado como trabalhando sábado
  const isAp = !!(colab.aprendiz === true || colab.isAprendiz === true);
  if (isAp && colab.trabalhaSabado !== true && colab.trabalhaSabado !== 'sim') {
    return true;
  }
  return false;
}

// Verificar se uma data é Feriado (Nacional ou para a filial)
function isHoliday(isoStr, branchId) {
  return appState.feriados.find(f => {
    if (f.data !== isoStr) return false;
    return f.escopo === 'NACIONAL' || f.escopo === branchId;
  });
}

// Converte "HH:MM" para minutos desde 00:00
function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

// Interpreta entrada flexível de tempo (ex: "01:00", "1:30", "60", "15 min", ":15", "15") para minutos inteiros
function parseTimeToMinutes(val) {
  if (val === null || val === undefined) return 0;
  let str = String(val).trim().toLowerCase().replace('min', '').replace('m', '').replace('h', ':').trim();
  if (!str) return 0;

  // Se tiver formato com traços ou dois pontos com hora vazia (ex: "--:15", "__:15", " :15", ":15")
  if (/^[\s\-_]*:(\d{1,2})$/.test(str)) {
    const m = str.match(/^[\s\-_]*:(\d{1,2})$/);
    str = '00:' + m[1];
  } else if (str.startsWith(':')) {
    str = '00' + str;
  }

  if (str.includes(':')) {
    const parts = str.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return Math.max(0, h * 60 + m);
  }

  const num = parseInt(str, 10);
  return isNaN(num) ? 0 : Math.max(0, num);
}

// Normaliza string de horário para formato "HH:MM", tratando minutos avulsos e horas vazias
function normalizeTimeInput(val) {
  if (!val) return '';
  let str = String(val).trim().toLowerCase().replace('min', '').replace('m', '').replace('h', ':').trim();
  if (!str) return '';

  // Apenas 1 ou 2 dígitos (ex: "15" -> "00:15", "5" -> "00:05", se < 60 trata como minutos)
  if (/^\d{1,2}$/.test(str)) {
    const n = parseInt(str, 10);
    if (n > 0 && n < 60) {
      return '00:' + String(n).padStart(2, '0');
    }
  }

  // Se começa com ":" ou tem traços/espaços antes dos minutos (ex: ":15", "--:15", " :15")
  if (/^[\s\-_]*:(\d{1,2})$/.test(str)) {
    const m = str.match(/^[\s\-_]*:(\d{1,2})$/);
    const mins = parseInt(m[1], 10) || 0;
    return '00:' + String(mins).padStart(2, '0');
  }
  if (str.startsWith(':')) {
    const mins = parseInt(str.slice(1), 10) || 0;
    return '00:' + String(mins).padStart(2, '0');
  }

  // Formato H:MM ou HH:MM
  if (/^\d{1,2}:\d{1,2}$/.test(str)) {
    const parts = str.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  // Formato 3 ou 4 dígitos sem dois pontos (ex: "130" -> "01:30", "0130" -> "01:30")
  if (/^\d{3,4}$/.test(str)) {
    const s = str.padStart(4, '0');
    const h = parseInt(s.slice(0, 2), 10);
    const m = parseInt(s.slice(2), 10);
    if (h < 24 && m < 60) {
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }
  }

  return str;
}

// Máscara interativa inteligente para campos de horário de atraso (HH:MM)
// - Ao focar ou clicar sem seleção prévia, sempre posiciona nas horas primeiro
// - Digitação contínua preenche horas e depois minutos
// - Clicar no lado dos minutos permite preencher apenas os minutos
// - Minutos isolados com horas vazias são salvos perfeitamente como 00:MM
function setupTimeMask(input) {
  if (!input || input._timeMaskInitialized) return;
  input._timeMaskInitialized = true;

  // Ao focar pelo teclado (ex: Tab)
  input.addEventListener('focus', () => {
    if (!input.value) {
      input.value = '00:00';
    }
    setTimeout(() => {
      if (document.activeElement === input) {
        if (input.selectionStart === input.selectionEnd) {
          // Sempre começa nas horas por padrão!
          input.setSelectionRange(0, 2);
        }
      }
    }, 10);
  });

  // Ao clicar com o mouse
  input.addEventListener('mouseup', () => {
    setTimeout(() => {
      if (!input.value) {
        input.value = '00:00';
      }
      // Se for clique simples (sem arrastar seleção de texto)
      if (input.selectionStart === input.selectionEnd) {
        if (input.selectionStart >= 3) {
          // Clicou especificamente nos minutos
          input.setSelectionRange(3, 5);
        } else {
          // Clicou nas horas ou no campo geral -> seleciona horas primeiro!
          input.setSelectionRange(0, 2);
        }
      }
    }, 10);
  });

  input.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (['Tab', 'Escape', 'Enter'].includes(e.key)) return;

    if (!input.value || !input.value.includes(':')) {
      input.value = '00:00';
      input.setSelectionRange(0, 2);
    }

    const val = input.value;
    let [hStr, mStr] = val.split(':');
    hStr = (hStr || '00').padStart(2, '0');
    mStr = (mStr || '00').padStart(2, '0');

    // Navegação com setas e dois pontos
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      input.setSelectionRange(0, 2);
      return;
    }
    if (e.key === 'ArrowRight' || e.key === ':') {
      e.preventDefault();
      input.setSelectionRange(3, 5);
      return;
    }

    // Tecla Backspace ou Delete
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      const inMinutes = input.selectionStart >= 3;
      if (inMinutes) {
        mStr = '00';
        input.value = hStr + ':' + mStr;
        input.setSelectionRange(0, 2); // volta para as horas
      } else {
        if (hStr !== '00') {
          hStr = '00';
          input.value = hStr + ':' + mStr;
          input.setSelectionRange(0, 2);
        } else {
          input.value = '';
          delete input.dataset.hadInitialValue;
        }
      }
      return;
    }

    // Se for dígito numérico (0 a 9)
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const d = e.key;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const inMinutes = start >= 3;

      if (!inMinutes) {
        // Editando Horas (0..2)
        if ((start === 0 && end === 2) || start === 0) {
          if (d >= '3') {
            hStr = '0' + d;
            input.value = hStr + ':' + mStr;
            input.setSelectionRange(3, 5); // Avança direto para minutos
          } else {
            hStr = d + hStr[1];
            input.value = hStr + ':' + mStr;
            input.setSelectionRange(1, 2); // Aguarda segundo dígito
          }
        } else if (start === 1) {
          let newH = parseInt(hStr[0] + d, 10);
          if (newH > 23) newH = 23;
          hStr = String(newH).padStart(2, '0');
          input.value = hStr + ':' + mStr;
          // Avança automaticamente para os minutos!
          input.setSelectionRange(3, 5);
        }
      } else {
        // Editando Minutos (3..5)
        if ((start === 3 && end === 5) || start === 3) {
          if (d >= '6') {
            mStr = '0' + d;
            input.value = hStr + ':' + mStr;
            input.setSelectionRange(3, 5);
          } else {
            mStr = d + mStr[1];
            input.value = hStr + ':' + mStr;
            input.setSelectionRange(4, 5);
          }
        } else if (start === 4) {
          let newM = parseInt(mStr[0] + d, 10);
          if (newM > 59) newM = 59;
          mStr = String(newM).padStart(2, '0');
          input.value = hStr + ':' + mStr;
          input.setSelectionRange(3, 5);
        }
      }
      return;
    }

    e.preventDefault();
  });

  input.addEventListener('input', () => {
    let val = input.value.trim();
    if (!val) return;
    const norm = normalizeTimeInput(val);
    if (norm !== val) {
      input.value = norm;
    }
  });

  input.addEventListener('blur', () => {
    let val = input.value.trim();
    if (!val) return;
    val = normalizeTimeInput(val);
    if (val === '00:00' && !input.dataset.hadInitialValue) {
      input.value = '';
    } else {
      input.value = val;
    }
  });
}

function minutesToTime(mins) {
  if (mins === null || isNaN(mins) || mins <= 0) return '00:00';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function formatMinutesFriendly(mins) {
  if (!mins || mins <= 0) return '0min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

/**
 * Avaliação Diária por Batidas:
 * Horários de Referência Padrão Euros Aço:
 *   EM (08:00), SM (12:00), ET (14:00), ST (18:00) - Intervalo de 2h de almoço
 *   Produção Depósito I: EM (07:00), SM (11:00), ET (13:00), ST (17:00)
 * Regra de Tolerância: 5 minutos de tolerância por período (não cumulativa).
 */
function evaluateDailyPunches(punches, customSchedule) {
  let refEM = 8 * 60;   // 08:00
  let refSM = 12 * 60;  // 12:00
  let refET = 14 * 60;  // 14:00 (Padrão Euros Aço: 08:00-12:00 / 14:00-18:00 com 2h de almoço)
  let refST = 18 * 60;  // 18:00

  let isTurnoUnico = false;

  if (customSchedule) {
    if (Array.isArray(customSchedule)) {
      if (customSchedule[0]) refEM = timeToMinutes(customSchedule[0]) || refEM;
      if (customSchedule[1]) refSM = timeToMinutes(customSchedule[1]) || refSM;
      if (customSchedule[2]) refET = timeToMinutes(customSchedule[2]) || refET;
      if (customSchedule[3]) refST = timeToMinutes(customSchedule[3]) || refST;
      if (!customSchedule[2] && !customSchedule[3]) isTurnoUnico = true;
    } else if (typeof customSchedule === 'string') {
      const parts = customSchedule.replace(/às/g, ' ').replace(/\//g, ' ').replace(/-/g, ' ').split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        refEM = timeToMinutes(parts[0]) || refEM;
        refSM = timeToMinutes(parts[1]) || refSM;
      }
      if (parts.length >= 4) {
        refET = timeToMinutes(parts[2]) || refET;
        refST = timeToMinutes(parts[3]) || refST;
      } else if (parts.length === 2) {
        isTurnoUnico = true;
      }
    } else if (typeof customSchedule === 'object') {
      if (customSchedule.descanso) {
        return { status: 'OK', delayMinutes: 0, delayText: '' };
      }
      if (customSchedule.e1) refEM = timeToMinutes(customSchedule.e1) || refEM;
      if (customSchedule.s1) refSM = timeToMinutes(customSchedule.s1) || refSM;
      if (customSchedule.e2) refET = timeToMinutes(customSchedule.e2) || refET;
      if (customSchedule.s2) refST = timeToMinutes(customSchedule.s2) || refST;
      if (!customSchedule.e2 && !customSchedule.s2) isTurnoUnico = true;
    }
  }

  // Ajuste inteligente: se não foi informado horário da tarde, mas a manhã é 07:00 / 11:00 (Produção Depósito I):
  if (!isTurnoUnico && (!customSchedule || (!customSchedule.e2 && !Array.isArray(customSchedule)))) {
    if (refEM <= 7 * 60 + 30 && refSM <= 11 * 60 + 30) {
      refET = 13 * 60; // 13:00
      refST = 17 * 60; // 17:00
    } else if (refSM > 0) {
      // Regra padrão de 2h de intervalo: se saiu às 12:00, volta às 14:00 (nunca às 13:00)
      refET = refSM + 120;
      refST = refET + 240;
    }
  }

  const pEM = timeToMinutes(punches?.em);
  const pSM = timeToMinutes(punches?.sm);
  const pET = timeToMinutes(punches?.et);
  const pST = timeToMinutes(punches?.st);

  let atrasoManha = 0;
  let atrasoTarde = 0;

  // Manhã
  if (pEM !== null && pEM > refEM) {
    const diff = pEM - refEM;
    if (diff > 5) atrasoManha += diff;
  }
  if (pSM !== null && pSM < refSM) {
    const diff = refSM - pSM;
    if (diff > 5) atrasoManha += diff;
  }

  // Tarde (somente quando previsto na escala)
  if (isTurnoUnico || (customSchedule && !customSchedule.e2 && !customSchedule.s2)) {
    // Escala de turno único (meio período / aprendiz / sábado)
  } else {
    if (pET !== null && pET > refET) {
      const diff = pET - refET;
      if (diff > 5) atrasoTarde += diff;
    }
    if (pST !== null && pST < refST) {
      const diff = refST - pST;
      if (diff > 5) atrasoTarde += diff;
    }
  }

  const totalAtraso = atrasoManha + atrasoTarde;

  if (totalAtraso > 0) {
    return {
      status: 'ATRASO',
      delayMinutes: totalAtraso,
      delayText: 'A.' + minutesToTime(totalAtraso)
    };
  }

  return { status: 'OK', delayMinutes: 0, delayText: '' };
}

/**
 * PENDÊNCIAS DO DIA (até 2 por dia)
 * Siglas: EM = Entrada Manhã, SM = Saída Manhã, ET = Entrada da Tarde, ST = Saída da Tarde,
 * além de FALTA, FM, FT, ATESTADO e 1/2 ATESTADO.
 * No dashboard exibe-se apenas a sigla; com 2 pendências: <PENDÊNCIA 1>+<PENDÊNCIA 2> (ex: SM+FT).
 */
const PENDENCIAS_BATIDA = ['EM', 'SM', 'ET', 'ST'];
const PENDENCIAS_PRIORIDADE = ['FALTA', 'FM', 'FT', 'ATESTADO', '1/2 ATESTADO', 'EM', 'SM', 'ET', 'ST'];

function getRegPendencias(reg) {
  if (!reg || !reg.override || reg.override === 'AUTO' || reg.override === 'OK') return [];
  const p1 = reg.override;
  // Férias/Afastamento não combinam com outra pendência
  if (p1 === 'FÉRIAS' || p1 === 'AFASTADO') return [p1];
  const list = [p1];
  const p2 = reg.override2;
  if (p2 && p2 !== p1 && PENDENCIAS_PRIORIDADE.includes(p2)) list.push(p2);
  return list;
}

function pendenciaDisplay(p) {
  if (p === '1/2 ATESTADO') return '½ AT';
  if (p === 'ATESTADO') return 'AT';
  if (p === 'AFASTADO') return 'AFAST';
  return p;
}

function pickPrimaryPendencia(list) {
  return list.slice().sort((a, b) => PENDENCIAS_PRIORIDADE.indexOf(a) - PENDENCIAS_PRIORIDADE.indexOf(b))[0];
}

function pendenciaCssClass(primary, count) {
  let cls = 'status-atraso';
  if (primary === 'FALTA') cls = 'status-falta';
  else if (primary === 'FM' || primary === 'FT') cls = 'status-half';
  else if (primary === 'ATESTADO' || primary === '1/2 ATESTADO') cls = 'status-atestado';
  return count > 1 ? cls + ' status-combo' : cls;
}

// Função unificada para buscar o registro de ponto sob qualquer formato de chave (colabId_data ou colab-cracha_data)
function getPontoRecord(colabId, isoStr) {
  if (!appState || !appState.registrosPonto) return null;
  const regKey = colabId + '_' + isoStr;
  let reg = appState.registrosPonto[regKey];
  if (reg) return reg;

  if (colabId && colabId.startsWith('colab_')) {
    const parts = colabId.split('_');
    const cracha = parts[2];
    if (cracha && appState.registrosPonto[`colab-${cracha}_${isoStr}`]) {
      return appState.registrosPonto[`colab-${cracha}_${isoStr}`];
    }
  } else if (colabId && colabId.startsWith('colab-')) {
    const cracha = colabId.replace('colab-', '');
    const cObj = appState.colaboradores?.find(c => Number(c.cracha) === Number(cracha));
    if (cObj && appState.registrosPonto[`${cObj.id}_${isoStr}`]) {
      return appState.registrosPonto[`${cObj.id}_${isoStr}`];
    }
  }
  return null;
}

/**
 * Determina o status consolidado de um colaborador em um dia específico
 */
function getDayStatus(colabId, isoStr, branchId) {
  const colab = appState.colaboradores.find(c => c.id === colabId);

  // 1. Data anterior à data de admissão
  if (colab && colab.admissao && isoStr < colab.admissao) {
    return {
      type: 'DISABLED',
      display: '-',
      cssClass: 'status-disabled',
      isPending: false,
      isWorkingDay: false,
      isSunday: false,
      isHoliday: false,
      isDisabled: true
    };
  }

  // 2. Data posterior à demissão do colaborador
  if (colab && colab.status === 'demitido' && colab.dataDemissao && isoStr > colab.dataDemissao) {
    return {
      type: 'DEMITIDO',
      display: 'DEMISSÃO',
      cssClass: 'status-demitido',
      isPending: false,
      isWorkingDay: false,
      isSunday: false,
      isHoliday: false,
      isDismissed: true
    };
  }

  const dateObj = new Date(isoStr + 'T12:00:00');
  const dayOfWeek = dateObj.getDay();

  // Domingos são automáticos e bloqueados
  // Colaboradores que NÃO trabalham no sábado (aprendizes, administrativo, etc.): o sábado fica travado com texto "SÁBADO", igual ao domingo
  const folgaSabado = isColabFolgaSabado(colab);

  if (dayOfWeek === 0 || (dayOfWeek === 6 && folgaSabado)) {
    const isSabado = dayOfWeek === 6;
    return {
      type: isSabado ? 'SÁBADO' : 'DOMINGO',
      display: isSabado ? 'SÁBADO' : 'DOMINGO',
      cssClass: 'status-domingo',
      isPending: false,
      isWorkingDay: false,
      isSunday: true,
      isHoliday: false
    };
  }

  // 1. Verificar Feriado: Feriados têm prioridade absoluta sobre qualquer modificação manual no dashboard.
  // Impossível de modificar a menos que seja excluído no cadastro de feriados.
  const holiday = isHoliday(isoStr, branchId);
  if (holiday) {
    return {
      type: 'FERIADO',
      display: 'FERIADO',
      cssClass: 'status-feriado',
      isPending: false,
      isWorkingDay: false,
      isSunday: false,
      isHoliday: true,
      holidayName: holiday.nome
    };
  }

  let reg = getPontoRecord(colabId, isoStr);
  const _now = new Date();
  const _todayIso = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
  const _isStaleFutureEmpty = reg && reg.override === 'VAZIO' && reg.note === 'Dia futuro em aberto (desmarcado)' && isoStr <= _todayIso;

  // Se houver override manual
  if (reg && reg.override && reg.override !== 'AUTO' && !_isStaleFutureEmpty) {
    const override = reg.override;
    const resolution = reg.resolution || 'NENHUMA';

    if (override === 'VAZIO') {
      return {
        type: 'VAZIO',
        display: '',
        cssClass: 'status-empty',
        isPending: false,
        isWorkingDay: false,
        isSunday: false,
        isHoliday: false,
        isEmptyDay: true,
        resolution
      };
    }

    if (override === 'OK' || resolution === 'ABONAR') {
      return {
        type: 'OK',
        display: 'OK',
        cssClass: 'status-ok',
        isPending: false,
        isWorkingDay: true,
        isSunday: false,
        isHoliday: false,
        resolution
      };
    }

    // Pendências do dia (até 2): FALTA, FM, FT, ATESTADO, 1/2 ATESTADO, EM, SM, ET, ST
    const pendList = getRegPendencias(reg);
    if (pendList.length > 0 && override !== 'FÉRIAS' && override !== 'AFASTADO') {
      const primary = pickPrimaryPendencia(pendList);
      return {
        type: primary,
        types: pendList,
        display: pendList.map(pendenciaDisplay).join('+'),
        cssClass: pendenciaCssClass(primary, pendList.length),
        isPending: true,
        isWorkingDay: true,
        isSunday: false,
        isHoliday: false,
        resolution
      };
    }

    if (override === 'FÉRIAS' || override === 'AFASTADO') {
      return {
        type: override,
        display: override === 'FÉRIAS' ? 'FÉRIAS' : 'AFAST',
        cssClass: 'status-ferias',
        isPending: false,
        isWorkingDay: false,
        isSunday: false,
        isHoliday: false,
        resolution
      };
    }
  }

  // Avaliação de Atrasos (Maior e Pequeno) ou por Batidas
  let atrasoMaiorMin = 0;
  let atrasoPequenoMin = 0;

  if (reg) {
    if (reg.override === 'AUTO' && reg.punches) {
      const dw = dateObj.getDay() + 1;
      let colabSchedule = colab?.horariosSemana ? (colab.horariosSemana[dw] || colab.horariosSemana[String(dw)]) : null;
      if (!colabSchedule && reg?.esperado) colabSchedule = reg.esperado;
      if (!colabSchedule && colab?.quadroNG) colabSchedule = colab.quadroNG;
      const evalResult = evaluateDailyPunches(reg.punches, colabSchedule);
      if (evalResult.status === 'ATRASO') {
        atrasoMaiorMin = evalResult.delayMinutes;
      } else {
        atrasoMaiorMin = 0;
      }
    } else {
      if (reg.atrasoMaiorMin !== undefined && reg.atrasoMaiorMin !== null) {
        atrasoMaiorMin = reg.atrasoMaiorMin;
      } else if (reg.atrasoMaior) {
        atrasoMaiorMin = parseTimeToMinutes(reg.atrasoMaior);
      }
    }

    if (reg.atrasoPequenoMin !== undefined && reg.atrasoPequenoMin !== null) {
      atrasoPequenoMin = reg.atrasoPequenoMin;
    } else if (reg.atrasoPequeno) {
      atrasoPequenoMin = parseTimeToMinutes(reg.atrasoPequeno);
    }
  }

  // Se não foi informado atraso manual e ainda não avaliou batidas
  if (atrasoMaiorMin === 0 && atrasoPequenoMin === 0 && reg && reg.punches && reg.override !== 'AUTO') {
    const dw = dateObj.getDay() + 1;
    let colabSchedule = colab?.horariosSemana ? (colab.horariosSemana[dw] || colab.horariosSemana[String(dw)]) : null;
    if (!colabSchedule && reg?.esperado) colabSchedule = reg.esperado;
    if (!colabSchedule && colab?.quadroNG) colabSchedule = colab.quadroNG;
    const evalResult = evaluateDailyPunches(reg.punches, colabSchedule);
    if (evalResult.status === 'ATRASO') {
      atrasoMaiorMin = evalResult.delayMinutes;
    }
  }

  // 1. ATRASO MAIOR: enviado para análise de pendência, aparece no dashboard (ex: A.01:00)
  if (atrasoMaiorMin > 0) {
    if (reg && reg.resolution === 'ABONAR') {
      return {
        type: 'OK',
        display: 'OK',
        cssClass: 'status-ok',
        isPending: false,
        isWorkingDay: true,
        isSunday: false,
        isHoliday: false,
        delayMinutes: atrasoMaiorMin,
        atrasoPequenoMin: atrasoPequenoMin,
        resolution: 'ABONAR'
      };
    }
    return {
      type: 'ATRASO',
      display: 'A.' + minutesToTime(atrasoMaiorMin),
      cssClass: 'status-atraso',
      isPending: true,
      isWorkingDay: true,
      isSunday: false,
      isHoliday: false,
      delayMinutes: atrasoMaiorMin,
      atrasoPequenoMin: atrasoPequenoMin,
      resolution: (reg && reg.resolution) || 'NENHUMA'
    };
  }

  // 2. PEQUENO ATRASO: NÃO aparece no dashboard como pendência! Continua OK, acumula no DSR
  if (atrasoPequenoMin > 0) {
    return {
      type: 'OK',
      display: 'OK',
      cssClass: 'status-ok',
      isPending: false,
      isWorkingDay: true,
      isSunday: false,
      isHoliday: false,
      delayMinutes: 0,
      atrasoPequenoMin: atrasoPequenoMin,
      resolution: (reg && reg.resolution) || 'NENHUMA'
    };
  }

  // Padrão: Dia regular OK
  return {
    type: 'OK',
    display: 'OK',
    cssClass: 'status-ok',
    isPending: false,
    isWorkingDay: true,
    isSunday: false,
    isHoliday: false
  };
}

// Obter status considerando a resolução de pendência
function getResolvedDayStatus(colabId, isoStr, branchId) {
  const base = getDayStatus(colabId, isoStr, branchId);
  if (base.resolution === 'ABONAR') {
    return { ...base, display: 'OK', isPending: false, cssClass: 'status-ok' };
  }
  return base;
}

/**
 * MOTOR DE DSR (Descanso Semanal Remunerado)
 * - Semana: Segunda a Domingo.
 * - Regra Base: 1 ou mais faltas não justificadas na semana = Perda do DSR (Domingo).
 * - Regra Feriados: Falta na semana com feriado = Desconta Domingo + Feriado (2 DSRs).
 * - Carry-over: Se a semana terminar no mês seguinte e houver falta na semana, a penalidade
 *   deve ser transferida e descontada no mês subsequente.
 */
function calculateDsrForEmployee(colabId, year, month, branchId) {
  const daysInMonth = getDaysInMonth(year, month);
  let totalDsrLost = 0;
  let breakdown = [];

  // Transferência de DSR entre meses (Carry-over) DESABILITADA até segunda ordem
  // Regra: DSR só é descontado se a semana culminar em um Domingo dentro do mês corrente.
  // Faltas no final do mês sem domingo restante no mês NÃO contam perda de DSR.

  let currentWeekDays = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const isoStr = formatDateISO(year, month, d);
    const dateObj = new Date(isoStr + 'T12:00:00');
    const dayOfWeek = dateObj.getDay();

    currentWeekDays.push({ isoStr, dayOfWeek, dayNum: d });

    // Só desconta DSR se a semana atingir o Domingo (DSR) dentro deste mês
    if (dayOfWeek === 0) {
      let hasUnjustifiedAbsence = false;
      let holidaysInWeek = 0;

      for (const day of currentWeekDays) {
        const resolved = getResolvedDayStatus(colabId, day.isoStr, branchId);
        const types = resolved.types || [resolved.type];
        const isFalta = types.some(t => t === 'FALTA' || t === 'FM' || t === 'FT');
        if (isFalta && resolved.resolution !== 'ABONAR') {
          hasUnjustifiedAbsence = true;
        }
        if (resolved.isHoliday) {
          holidaysInWeek++;
        }
      }

      if (hasUnjustifiedAbsence) {
        let penalty = 1;
        if (holidaysInWeek > 0) {
          penalty += holidaysInWeek;
        }
        totalDsrLost += penalty;
        const weekEndStr = formatDateBR(currentWeekDays[currentWeekDays.length - 1].isoStr);
        const motivo = holidaysInWeek > 0 ? `Falta + ${holidaysInWeek} Feriado(s)` : 'Falta semanal';
        breakdown.push(`Semana encerrada em ${weekEndStr} (Domingo): -${penalty} DSR (${motivo})`);
      }

      currentWeekDays = [];
    }
  }

  return { totalDsrLost, breakdown };
}

/**
 * Apuração Consolidada de DSR, Faltas e Somatória de Atrasos (Maiores + Pequenos)
 */
function calculateDsrAndOccurrences(colabId, year, month, branchId) {
  const colab = appState.colaboradores.find(c => c.id === colabId);
  const daysInMonth = getDaysInMonth(year, month);
  const dsrInfo = calculateDsrForEmployee(colabId, year, month, branchId);

  let faltasIntegrais = 0;
  let faltasMeioPeriodo = 0;
  let atrasosMaioresMinutos = 0;
  let atrasosMaioresQtd = 0;
  let pequenosAtrasosMinutos = 0;
  let pequenosAtrasosQtd = 0;
  let ocorrencias = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const isoStr = formatDateISO(year, month, d);
    const reg = getPontoRecord(colabId, isoStr);
    const resolved = getResolvedDayStatus(colabId, isoStr, branchId);

    // Ignora dias desabilitados, demissão e domingos
    if (resolved.isDisabled || resolved.isDismissed || resolved.isSunday) {
      continue;
    }

    const dayTypes = resolved.types || [resolved.type];
    const notAbonado = resolved.resolution !== 'ABONAR';

    // 1. Faltas Integrais (não abonadas)
    if (dayTypes.includes('FALTA') && notAbonado) {
      faltasIntegrais++;
      ocorrencias.push({
        data: isoStr,
        tipo: 'Falta Integral',
        badgeClass: 'status-falta',
        tempo: 'Dia Completo',
        impacto: 'Gera perda de DSR semanal',
        obs: reg?.note || 'Falta não justificada'
      });
    }

    // 2. Faltas Meio Período (Apenas FT e FM)
    dayTypes.filter(t => t === 'FM' || t === 'FT').forEach(t => {
      if (!notAbonado) return;
      faltasMeioPeriodo++;
      ocorrencias.push({
        data: isoStr,
        tipo: 'Falta Meio Período (' + t + ')',
        badgeClass: 'status-half',
        tempo: '1/2 Período',
        impacto: 'Gera perda de DSR semanal + Desconto VA/Folha',
        obs: reg?.note || 'Ausência parcial (' + t + ')'
      });
    });

    // 3. Atestados Médicos (Integral e 1/2 Atestado) - Justificados (não são faltas injustificadas)
    dayTypes.filter(t => t === 'ATESTADO' || t === '1/2 ATESTADO').forEach(t => {
      if (!notAbonado) return;
      const isHalf = t === '1/2 ATESTADO';
      ocorrencias.push({
        data: isoStr,
        tipo: isHalf ? '½ Atestado Médico (Justificado)' : 'Atestado Médico Integral (Justificado)',
        badgeClass: 'status-atestado',
        tempo: isHalf ? '1/2 Período' : 'Dia Completo',
        impacto: 'Ausência justificada (não perde DSR)',
        obs: reg?.note || (isHalf ? 'Meio período abonado por atestado' : 'Atestado médico anexado')
      });
    });

    // 3.1 Pendências de Batida (EM, SM, ET, ST)
    dayTypes.filter(t => PENDENCIAS_BATIDA.includes(t)).forEach(t => {
      if (!notAbonado) return;
      const nomes = { EM: 'Entrada Manhã', SM: 'Saída Manhã', ET: 'Entrada da Tarde', ST: 'Saída da Tarde' };
      ocorrencias.push({
        data: isoStr,
        tipo: 'Pendência de Batida (' + t + ' - ' + nomes[t] + ')',
        badgeClass: 'status-atraso',
        tempo: t,
        impacto: 'Pendência no Dashboard',
        obs: reg?.note || 'Batida pendente de análise'
      });
    });

    // 4. Atrasos Maiores e Pequenos Atrasos
    let maiorMin = 0;
    let pequenoMin = 0;

    if (reg) {
      if (reg.override === 'AUTO') {
        maiorMin = (resolved.type === 'ATRASO' && resolved.delayMinutes) ? resolved.delayMinutes : 0;
      } else if (reg.atrasoMaiorMin !== undefined && reg.atrasoMaiorMin !== null) {
        maiorMin = reg.atrasoMaiorMin;
      } else if (reg.atrasoMaior) {
        maiorMin = parseTimeToMinutes(reg.atrasoMaior);
      } else if (resolved.type === 'ATRASO' && resolved.delayMinutes) {
        maiorMin = resolved.delayMinutes;
      }

      if (reg.atrasoPequenoMin !== undefined && reg.atrasoPequenoMin !== null) {
        pequenoMin = reg.atrasoPequenoMin;
      } else if (reg.atrasoPequeno) {
        pequenoMin = parseTimeToMinutes(reg.atrasoPequeno);
      }
    } else if (resolved.type === 'ATRASO' && resolved.delayMinutes) {
      maiorMin = resolved.delayMinutes;
    }

    if (maiorMin > 0) {
      atrasosMaioresMinutos += maiorMin;
      atrasosMaioresQtd++;
      ocorrencias.push({
        data: isoStr,
        tipo: 'Atraso Maior (Dashboard)',
        badgeClass: 'status-atraso',
        tempo: minutesToTime(maiorMin) + ' (' + formatMinutesFriendly(maiorMin) + ')',
        impacto: resolved.resolution === 'ABONAR' ? 'Abonado' : 'Pendência no Dashboard',
        obs: reg?.note || (resolved.resolution === 'ABONAR' ? 'Abonado pela chefia' : 'Enviado para análise')
      });
    }

    if (pequenoMin > 0) {
      pequenosAtrasosMinutos += pequenoMin;
      pequenosAtrasosQtd++;
      ocorrencias.push({
        data: isoStr,
        tipo: 'Pequeno Atraso (Somente DSR)',
        badgeClass: 'status-small-delay',
        tempo: minutesToTime(pequenoMin) + ' (' + formatMinutesFriendly(pequenoMin) + ')',
        impacto: 'Acumulado no DSR (sem pendência)',
        obs: reg?.note || 'Pequeno atraso registrado'
      });
    }
  }

  const totalAtrasosMinutos = atrasosMaioresMinutos + pequenosAtrasosMinutos;

  return {
    colab,
    totalDsrLost: dsrInfo.totalDsrLost,
    dsrBreakdown: dsrInfo.breakdown,
    faltasIntegrais,
    faltasMeioPeriodo,
    atrasosMaioresMinutos,
    atrasosMaioresQtd,
    pequenosAtrasosMinutos,
    pequenosAtrasosQtd,
    totalAtrasosMinutos,
    ocorrencias
  };
}

function openDsrDetailsModal(colabId) {
  const colab = appState.colaboradores.find(c => c.id === colabId);
  if (!colab) return;

  const data = calculateDsrAndOccurrences(colabId, appState.currentYear, appState.currentMonth, appState.activeBranchId);
  const branch = appState.filiais.find(f => f.id === colab.filialId);
  const dept = appState.departamentos.find(d => d.id === colab.deptId);

  // Header Summary
  const summaryEl = document.getElementById('dsr-modal-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div>
        <strong style="color:var(--color-cyan); font-size:15px;">${escapeHtml(colab.nome)}</strong>
        <span style="font-family:var(--font-mono); font-size:12px; color:var(--color-text-sub); margin-left:8px;">(Crachá: ${colab.cracha})</span>
        <div style="font-size:11px; color:var(--color-text-sub); margin-top:3px;">
          Setor: <strong>${escapeHtml(dept ? dept.nome : 'Geral')}</strong> • Filial: <strong>${escapeHtml(branch ? branch.nome : '')}</strong>
          ${colab.status === 'demitido' ? ' • <span style="color:#F87171;">Desligado em: ' + formatDateBR(colab.dataDemissao) + '</span>' : ''}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px; color:var(--color-blue-bright); font-weight:700;">
          Mês: ${MESES_PT[appState.currentMonth]}/${appState.currentYear}
        </div>
        <div style="font-size:11px; color:var(--color-text-muted); margin-top:2px;">
          Total de Ocorrências: <strong>${data.ocorrencias.length}</strong>
        </div>
      </div>
    `;
  }

  // KPIs
  const kpiLost = document.getElementById('dsr-kpi-lost');
  if (kpiLost) kpiLost.textContent = data.totalDsrLost;

  const kpiFaltas = document.getElementById('dsr-kpi-faltas');
  if (kpiFaltas) kpiFaltas.textContent = data.faltasIntegrais;

  const kpiHalf = document.getElementById('dsr-kpi-half');
  if (kpiHalf) kpiHalf.textContent = data.faltasMeioPeriodo;

  const kpiAtrasoTotal = document.getElementById('dsr-kpi-atraso-total');
  if (kpiAtrasoTotal) kpiAtrasoTotal.textContent = minutesToTime(data.totalAtrasosMinutos);

  const kpiAtrasoSub = document.getElementById('dsr-kpi-atraso-sub');
  if (kpiAtrasoSub) {
    kpiAtrasoSub.textContent = `Maiores: ${formatMinutesFriendly(data.atrasosMaioresMinutos)} • Pequenos: ${formatMinutesFriendly(data.pequenosAtrasosMinutos)}`;
  }

  // Breakdown Regras DSR (CLT)
  const rulesBox = document.getElementById('dsr-rules-box');
  if (rulesBox) {
    if (data.dsrBreakdown && data.dsrBreakdown.length > 0) {
      rulesBox.innerHTML = `
        <div style="background:rgba(239, 68, 68, 0.08); border-left:4px solid #EF4444; padding:10px 14px; border-radius:0 var(--radius-sm) var(--radius-sm) 0;">
          <div style="font-weight:700; color:#FCA5A5; font-size:11px; text-transform:uppercase; margin-bottom:4px;">
            ⚠️ Regras Legais de Desconto do DSR (Lei 605/49):
          </div>
          <ul style="margin:0; padding-left:18px; font-size:11px; color:var(--color-text-main);">
            ${data.dsrBreakdown.map(b => `<li style="margin-bottom:2px;">${escapeHtml(b)}</li>`).join('')}
          </ul>
        </div>
      `;
      rulesBox.style.display = 'block';
    } else {
      rulesBox.innerHTML = `
        <div style="background:rgba(16, 185, 129, 0.08); border-left:4px solid #10B981; padding:8px 12px; border-radius:0 var(--radius-sm) var(--radius-sm) 0; font-size:11px; color:#6EE7B7;">
          ✅ <strong>Sem perda de DSR:</strong> Assiduidade regular mantida durante as semanas do mês.
        </div>
      `;
      rulesBox.style.display = 'block';
    }
  }

  // Ocorrências Tbody
  const countEl = document.getElementById('dsr-count-ocorrencias');
  if (countEl) countEl.textContent = `${data.ocorrencias.length} registro(s)`;

  const tbody = document.getElementById('dsr-ocorrencias-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    if (data.ocorrencias.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="5" style="text-align:center; padding:24px 12px; color:var(--color-text-sub);">
          <div style="font-size:24px; margin-bottom:6px;">🌟</div>
          <div style="font-weight:600; color:var(--color-text-main);">Nenhuma falta ou atraso registrado no mês!</div>
          <div style="font-size:11px; margin-top:2px;">O colaborador possui 100% de assiduidade e pontualidade neste período.</div>
        </td>
      `;
      tbody.appendChild(tr);
    } else {
      data.ocorrencias.forEach(item => {
        const tr = document.createElement('tr');
        const dateObj = new Date(item.data + 'T12:00:00');
        const dayOfWeek = DIAS_SEMANA_SIGLA[dateObj.getDay()];
        tr.innerHTML = `
          <td style="font-family:var(--font-mono); font-weight:700;">${formatDateBR(item.data)} (${dayOfWeek})</td>
          <td><span class="${item.badgeClass}">${escapeHtml(item.tipo)}</span></td>
          <td style="font-family:var(--font-mono); font-weight:600;">${item.tempo}</td>
          <td style="font-size:11px; color:var(--color-text-sub);">${escapeHtml(item.impacto)}</td>
          <td style="font-size:11px; color:var(--color-text-muted);">${escapeHtml(item.obs || '-')}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  openModal('modal-dsr-details');
}

/**
 * MOTOR DE VALE ALIMENTAÇÃO (VA)
 * - Valor base: R$ 8,00 por dia útil
 * - Dias Úteis: Exclui Domingos e Feriados da filial
 * - Não registra ponto: "aparece apenas no vale alimentação com o crédito máximo do mês de acordo com as regras dos dias úteis"
 * - Demissão: "ao final do mês é pago o vale alimentação dos dias úteis trabalhados até a data de demissão"
 */
function calculateVAForEmployee(colabId, year, month, branchId) {
  const colab = appState.colaboradores.find(c => c.id === colabId);
  const daysInMonth = getDaysInMonth(year, month);
  let totalBusinessDays = 0;
  let fullDaysWorked = 0;
  let halfDaysWorked = 0;
  let absenceDays = 0;
  let valorLiquido = 0;
  let valorDescontado = 0;
  let dailyAudit = [];

  const doesNotPunch = colab && colab.registraPonto === false;
  const isDemitido = colab && colab.status === 'demitido' && colab.dataDemissao;
  const isAprendiz = !!(colab && (colab.aprendiz === true || colab.isAprendiz === true));
  const folgaSabado = isColabFolgaSabado(colab);
  const naoRecebeVa = !!(colab && (colab.naoRecebeVa === true || colab.recebeVa === false));
  const baseRate = isAprendiz ? 4.00 : 8.00;
  const halfRate = isAprendiz ? 2.00 : 4.00;

  // Se o colaborador não tem direito a Vale Alimentação
  if (naoRecebeVa) {
    for (let d = 1; d <= daysInMonth; d++) {
      const isoStr = formatDateISO(year, month, d);
      const dateObj = new Date(isoStr + 'T12:00:00');
      const dayOfWeek = dateObj.getDay();
      const dayOfWeekName = DIAS_SEMANA_SIGLA[dayOfWeek];
      dailyAudit.push({
        dateStr: formatDateBR(isoStr),
        dayOfWeek: dayOfWeekName,
        isBusinessDay: false,
        resolvedType: 'SEM VA',
        creditado: 0,
        descontado: 0,
        note: 'Colaborador não recebe Vale Alimentação (Sem direito a VA)'
      });
    }
    return {
      isAprendiz,
      naoRecebeVa: true,
      baseDailyRate: 0,
      totalBusinessDays: 0,
      fullDaysWorked: 0,
      halfDaysWorked: 0,
      absenceDays: 0,
      potencialMaximo: 0,
      valorLiquido: 0,
      valorDescontado: 0,
      dailyAudit
    };
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const isoStr = formatDateISO(year, month, d);
    const dateObj = new Date(isoStr + 'T12:00:00');
    const dayOfWeek = dateObj.getDay();
    const dayOfWeekName = DIAS_SEMANA_SIGLA[dayOfWeek];
    const holiday = isHoliday(isoStr, branchId);

    const isSunday = dayOfWeek === 0;
    const isSabadoFolga = dayOfWeek === 6 && folgaSabado;
    const isRestDay = isSunday || isSabadoFolga;
    const isHolidayDay = !!holiday;
    const isStandardBusinessDay = !isRestDay && !isHolidayDay;

    // Verificação de período de vigência contratual
    const isBeforeAdmission = colab && colab.admissao && isoStr < colab.admissao;
    const isAfterDismissal = isDemitido && isoStr > colab.dataDemissao;

    let creditado = 0;
    let descontado = 0;
    let note = '';
    let resolvedDisplay = '';

    if (!isStandardBusinessDay) {
      resolvedDisplay = isRestDay ? (isSunday ? 'DOMINGO' : 'SÁBADO') : 'FERIADO';
      note = isRestDay ? (isSunday ? 'Domingo (Sem VA)' : 'Sábado (Folga Semanal - Sem VA)') : ('Feriado: ' + holiday.nome);
    } else if (isBeforeAdmission) {
      resolvedDisplay = '-';
      note = 'Pré-admissão (Admissão: ' + formatDateBR(colab.admissao) + ')';
    } else if (isAfterDismissal) {
      resolvedDisplay = 'DEMISSÃO';
      note = 'Pós-rescisão (Demitido em: ' + formatDateBR(colab.dataDemissao) + ')';
    } else {
      // Dia útil trabalhado
      totalBusinessDays++;

      if (doesNotPunch) {
        // NÃO REGISTRA PONTO: crédito integral conforme tipo de colaborador
        creditado = baseRate;
        descontado = 0.00;
        fullDaysWorked++;
        resolvedDisplay = 'INTEGRAL';
        note = isAprendiz 
          ? 'Crédito Aprendiz (Meio período - R$ 4,00/dia)' 
          : 'Crédito integral (Isento de registro de ponto)';
      } else {
        const resolved = getResolvedDayStatus(colabId, isoStr, branchId);
        resolvedDisplay = resolved.display;

        if (resolved.type === 'OK') {
          creditado = baseRate;
          descontado = 0.00;
          fullDaysWorked++;
          note = isAprendiz 
            ? 'Dia trabalhado Aprendiz (Meio período: R$ 4,00)' 
            : 'Dia integral trabalhado (R$ 8,00)';
        } else if (resolved.types && resolved.types.length > 0) {
          // Pendências do dia (até 2). ATESTADO e 1/2 ATESTADO NÃO descontam VA.
          const types = resolved.types;
          const hasFalta = types.includes('FALTA');
          const halfCount = types.filter(t => t === 'FM' || t === 'FT').length;
          const hasPunchPend = types.some(t => PENDENCIAS_BATIDA.includes(t));
          const punchDiscounts = hasPunchPend && halfCount === 0 &&
            (resolved.resolution === 'DESCONTAR_VA' || resolved.resolution === 'DESCONTAR_AMBOS');

          let desc = 0;
          if (hasFalta) {
            desc = baseRate;
          } else {
            desc = halfCount * halfRate;
            if (punchDiscounts) desc += halfRate;
          }
          desc = Math.min(desc, baseRate);

          creditado = baseRate - desc;
          descontado = desc;

          if (desc <= 0) {
            fullDaysWorked++;
            note = types.some(t => t === 'ATESTADO' || t === '1/2 ATESTADO')
              ? 'Atestado médico (' + resolved.display + ') - sem desconto de VA'
              : 'Pendência (' + resolved.display + ') - VA mantido';
          } else if (desc >= baseRate) {
            absenceDays++;
            note = resolved.display + ' - Desconto integral de R$ ' + baseRate.toFixed(2).replace('.', ',');
          } else {
            halfDaysWorked++;
            note = 'Meio período (' + resolved.display + ') - Desconto R$ ' + desc.toFixed(2).replace('.', ',');
          }
        } else if (resolved.type === 'ATRASO') {
          if (resolved.resolution === 'DESCONTAR_VA' || resolved.resolution === 'DESCONTAR_AMBOS') {
            creditado = halfRate;
            descontado = halfRate;
            note = 'Atraso com desconto em VA (' + resolved.display + ') - R$ ' + halfRate.toFixed(2).replace('.', ',');
          } else {
            creditado = baseRate;
            descontado = 0.00;
            fullDaysWorked++;
            note = 'Atraso com VA mantido (' + resolved.display + ')';
          }
        } else if (resolved.type === 'FÉRIAS' || resolved.type === 'AFASTADO') {
          creditado = 0.00;
          descontado = baseRate;
          absenceDays++;
          note = resolved.type + ' - Sem benefício de VA';
        } else if (resolved.type === 'VAZIO') {
          creditado = 0.00;
          descontado = 0.00;
          note = 'Dia futuro em aberto (desmarcado)';
        }
      }
    }

    valorLiquido += creditado;
    valorDescontado += descontado;

    dailyAudit.push({
      dateStr: formatDateBR(isoStr),
      dayOfWeek: dayOfWeekName,
      isBusinessDay: isStandardBusinessDay && !isBeforeAdmission && !isAfterDismissal,
      resolvedType: resolvedDisplay,
      creditado,
      descontado,
      note
    });
  }

  const potencialMaximo = totalBusinessDays * baseRate;

  return {
    isAprendiz,
    baseDailyRate: baseRate,
    totalBusinessDays,
    fullDaysWorked,
    halfDaysWorked,
    absenceDays,
    potencialMaximo,
    valorLiquido,
    valorDescontado,
    dailyAudit
  };
}

// ==========================================================================
// 4. RENDERIZAÇÃO DA INTERFACE & NAVEGAÇÃO
// ==========================================================================

function updateNavTabsActive(targetView) {
  if (!targetView) targetView = 'view-ponto';
  appState.activeView = targetView;

  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    if (btn.dataset.view === targetView) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.app-view').forEach(view => {
    if (view.id === targetView) {
      view.style.display = 'block';
      view.classList.add('active-view');
    } else {
      view.style.display = 'none';
      view.classList.remove('active-view');
    }
  });

  // Fecha eventuais modais que tenham ficado abertos ao trocar de tela
  document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));

  // Toolbar visibilidade (apenas ponto e va utilizam a toolbar global)
  const toolbar = document.getElementById('main-toolbar');
  const boxFilterStatus = document.getElementById('box-filter-status');
  if (targetView === 'view-ponto' || targetView === 'view-va') {
    if (toolbar) toolbar.style.display = 'flex';
    if (boxFilterStatus) boxFilterStatus.style.display = 'flex';
  } else {
    if (toolbar) toolbar.style.display = 'none';
  }

  // Rolagem unificada no Dashboard de Ponto (header e filtros rolam junto com a página)
  const isPonto = targetView === 'view-ponto';
  document.body.classList.toggle('ponto-scroll-mode', isPonto);
  document.documentElement.classList.toggle('ponto-scroll-mode', isPonto);

  // Persistir última tela ativa
  try {
    localStorage.setItem('ponto_app_last_active_view', targetView);
  } catch (e) {}
}

function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-tab-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const targetView = btn.dataset.view;
      if (!targetView) return;
      appState.activeView = targetView;
      updateNavTabsActive(targetView);
      try {
        renderCurrentView();
      } catch (err) {
        console.error('Erro ao renderizar tela ' + targetView + ':', err);
      }
    });
  });
}

function updateMainToolbarDepartmentOptions() {
  const deptSelect = document.getElementById('filter-dept-select');
  if (!deptSelect) return;
  const currentVal = appState.departmentFilter || 'todos';

  let html = '<option value="todos">Todos os Deptos</option>';
  appState.departamentos.forEach(d => {
    html += '<option value="' + d.id + '">' + escapeHtml(d.nome) + '</option>';
  });
  deptSelect.innerHTML = html;
  deptSelect.value = currentVal;
}

function renderCurrentView() {
  checkAndRolloverPendingNotices();
  syncDismissalNotices();

  renderBranchTabs();
  updateMonthDisplay();
  updateMainToolbarDepartmentOptions();

  if (appState.activeView === 'view-avisos') {
    renderAvisosView();
  } else if (appState.activeView === 'view-ponto') {
    renderMatrixView();
  } else if (appState.activeView === 'view-va') {
    renderVAView();
  } else if (appState.activeView === 'view-colaboradores') {
    renderColaboradoresView();
  } else if (appState.activeView === 'view-estrutura') {
    renderEstruturaView();
  } else if (appState.activeView === 'view-feriados') {
    renderFeriadosView();
  } else if (appState.activeView === 'view-importacao') {
    renderImportacaoView();
  }
}

function resetMainAndColabFilters(showNotification = false) {
  // 1. Toolbar Principal (Ponto e Fechamento de VA)
  appState.searchFilter = '';
  const searchIn = document.getElementById('search-filter-input');
  if (searchIn) searchIn.value = '';

  appState.departmentFilter = 'todos';
  const deptSel = document.getElementById('filter-dept-select');
  if (deptSel) deptSel.value = 'todos';

  appState.statusFilter = 'ativos';
  const stSel = document.getElementById('filter-status-select');
  if (stSel) stSel.value = 'ativos';

  appState.sortBy = 'nome';
  const sortSel = document.getElementById('sort-select');
  if (sortSel) sortSel.value = 'nome';

  appState.focusMode = false;
  document.getElementById('focus-toggle-btn')?.classList.remove('active');

  // 2. Filtros da Gestão de Colaboradores
  const colabSearch = document.getElementById('colab-search-input');
  if (colabSearch) colabSearch.value = '';
  const colabDept = document.getElementById('colab-filter-dept');
  if (colabDept) colabDept.value = 'todos';
  const colabStatus = document.getElementById('colab-filter-status');
  if (colabStatus) colabStatus.value = 'ativo';
  const colabPonto = document.getElementById('colab-filter-ponto');
  if (colabPonto) colabPonto.value = 'todos';
  const colabSort = document.getElementById('colab-sort-order');
  if (colabSort) colabSort.value = 'cracha';

  // 3. Filtros do Calendário de Avisos
  appState.calFilterDept = 'todos';
  const calDept = document.getElementById('cal-filter-dept');
  if (calDept) calDept.value = 'todos';
  const calTipo = document.getElementById('cal-filter-tipo');
  if (calTipo) calTipo.value = 'todos';
  const calStatus = document.getElementById('cal-filter-status');
  if (calStatus) calStatus.value = 'todos';

  if (showNotification) {
    showToast('Filtros redefinidos: exibindo todos em ordem alfabética.', 'info');
  }
}

function renderBranchTabs() {
  const container = document.getElementById('branch-tabs-list');
  if (!container) return;

  // Telas globais desmarcam a empresa selecionada
  const isGlobalView = appState.activeView === 'view-estrutura' || appState.activeView === 'view-feriados';

  container.innerHTML = '';
  appState.filiais.forEach(branch => {
    const colabCount = appState.colaboradores.filter(c => c.filialId === branch.id).length;
    const btn = document.createElement('div');
    const isActive = !isGlobalView && branch.id === appState.activeBranchId;
    btn.className = 'branch-tab-item ' + (isActive ? 'active' : '');
    btn.innerHTML = '<span>' + branch.nome + '</span><span class="branch-badge">' + colabCount + '</span>';
    btn.title = isGlobalView ? 'Clique para selecionar esta filial' : 'Filial: ' + branch.nome;
    btn.addEventListener('click', () => {
      appState.activeBranchId = branch.id;
      // Ao mudar de filial, reseta todos os filtros
      resetMainAndColabFilters(false);
      // Se estava em tela global e clicou na filial, vai para o mural ou mantém e marca
      if (appState.activeView === 'view-estrutura' || appState.activeView === 'view-feriados') {
        appState.activeView = 'view-avisos';
        updateNavTabsActive('view-avisos');
      }
      saveStateToStorage();
      renderCurrentView();
      showToast('Filial selecionada: ' + branch.nome + '. Filtros redefinidos.', 'info');
    });
    container.appendChild(btn);
  });
}

function updateMonthDisplay() {
  const el = document.getElementById('display-current-month');
  if (el) {
    el.textContent = MESES_PT[appState.currentMonth] + ' ' + appState.currentYear;
  }
}


/**
 * Filtro e Ordenação de Colaboradores
 * @param {boolean} isForPonto Se verdadeiro, aplica filtros específicos da Matriz de Ponto
 */
function getFilteredAndSortedEmployees(isForPonto = false) {
  let list = appState.colaboradores.filter(c => c.filialId === appState.activeBranchId);

  // 1. Filtro por Departamento (Setor)
  if (appState.departmentFilter && appState.departmentFilter !== 'todos') {
    list = list.filter(c => c.deptId === appState.departmentFilter);
  }

  // Filtro de Ponto
  if (isForPonto) {
    // 1. Quem NÃO registra ponto não aparece na matriz de ponto
    list = list.filter(c => c.registraPonto !== false);

    // 2. Filtro de Situação (Ativos / Demitidos / Todos)
    const stFilter = appState.statusFilter || 'ativos';
    if (stFilter === 'ativos') {
      list = list.filter(c => c.status !== 'demitido' && !c.dataDemissao);
    } else if (stFilter === 'demitidos') {
      list = list.filter(c => c.status === 'demitido' || !!c.dataDemissao);
    }
  } else {
    // No Vale Alimentação: respeita estritamente o filtro de situação
    const stFilter = appState.statusFilter || 'ativos';
    if (stFilter === 'ativos') {
      list = list.filter(c => c.status !== 'demitido' && !c.dataDemissao);
    } else if (stFilter === 'demitidos') {
      list = list.filter(c => c.status === 'demitido' || !!c.dataDemissao);
    }
  }

  // Filtro de busca textual
  const searchQ = (appState.searchFilter || '').trim().toLowerCase();
  if (searchQ) {
    list = list.filter(c =>
      c.nome.toLowerCase().includes(searchQ) ||
      String(c.cracha).includes(searchQ)
    );
  }

  // MODO FOCO: Oculta apenas quem é 100% OK no mês selecionado
  if (appState.focusMode && isForPonto) {
    const daysInMonth = getDaysInMonth(appState.currentYear, appState.currentMonth);
    list = list.filter(colab => {
      let hasPendencia = false;
      for (let d = 1; d <= daysInMonth; d++) {
        const isoStr = formatDateISO(appState.currentYear, appState.currentMonth, d);
        const resolved = getResolvedDayStatus(colab.id, isoStr, appState.activeBranchId);
        if (resolved.isPending) {
          hasPendencia = true;
          break;
        }
      }
      return hasPendencia;
    });
  }

  // Ordenação
  const deptMap = Object.fromEntries(appState.departamentos.map(d => [d.id, d.nome]));

  list.sort((a, b) => {
    // Prioridade Máxima na Busca: Nomes que iniciam com as letras digitadas ficam no topo independente do crachá!
    if (searchQ) {
      const aStarts = a.nome.toLowerCase().startsWith(searchQ);
      const bStarts = b.nome.toLowerCase().startsWith(searchQ);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
    }

    if (appState.sortBy === 'nome') {
      return a.nome.localeCompare(b.nome);
    } else if (appState.sortBy === 'data_admissao') {
      return new Date(a.admissao) - new Date(b.admissao);
    } else if (appState.sortBy === 'departamento') {
      const deptA = deptMap[a.deptId] || '';
      const deptB = deptMap[b.deptId] || '';
      const compDept = deptA.localeCompare(deptB);
      if (compDept !== 0) return compDept;
      return a.nome.localeCompare(b.nome);
    } else {
      // Padrão: Crachá (ou ordem alfabética se estiver pesquisando com prefixo)
      if (searchQ) {
        return a.nome.localeCompare(b.nome);
      }
      return Number(a.cracha) - Number(b.cracha);
    }
  });

  return list;
}

// ==========================================================================
// 5. RENDERIZAÇÃO DA MATRIZ DE PONTO (DASHBOARD PRINCIPAL)
// ==========================================================================
let selectedMatrixColabId = null;
let selectedMatrixDate = null;

function applyMatrixSelection(colabId, isoDate, shouldScroll = true) {
  if (colabId !== undefined && colabId !== null) selectedMatrixColabId = colabId;
  if (isoDate !== undefined && isoDate !== null) selectedMatrixDate = isoDate;

  const tbody = document.getElementById('matrix-tbody');
  const thead = document.getElementById('matrix-thead');
  if (!tbody) return;

  // 1. Linhas: destaca a linha do funcionário selecionado
  tbody.querySelectorAll('tr').forEach(tr => {
    if (selectedMatrixColabId && tr.dataset.colabId === selectedMatrixColabId) {
      tr.classList.add('selected-row');
    } else {
      tr.classList.remove('selected-row');
    }
  });

  // 2. Colunas no thead: destaca o cabeçalho do dia selecionado
  if (thead) {
    thead.querySelectorAll('th[data-date]').forEach(th => {
      if (selectedMatrixDate && th.dataset.date === selectedMatrixDate) {
        th.classList.add('selected-col');
      } else {
        th.classList.remove('selected-col');
      }
    });
  }

  // 3. Colunas no tbody: destaca as células do dia verticalmente
  tbody.querySelectorAll('td[data-date]').forEach(td => {
    if (selectedMatrixDate && td.dataset.date === selectedMatrixDate) {
      td.classList.add('selected-col');
    } else {
      td.classList.remove('selected-col');
    }
  });

  // 4. Célula exata de interseção (ponto/horário selecionado)
  tbody.querySelectorAll('.cell-ponto').forEach(cell => {
    if (selectedMatrixColabId && selectedMatrixDate &&
        cell.dataset.colabId === selectedMatrixColabId &&
        cell.dataset.date === selectedMatrixDate) {
      cell.classList.add('cell-selected');
    } else {
      cell.classList.remove('cell-selected');
    }
  });

  // 5. Acompanhamento automático da tela com a célula selecionada
  if (shouldScroll) {
    scrollSelectedCellIntoView(true);
  }
}

function renderMatrixView() {
  const thead = document.getElementById('matrix-thead');
  const tbody = document.getElementById('matrix-tbody');
  if (!thead || !tbody) return;

  const year = appState.currentYear;
  const month = appState.currentMonth;
  const daysInMonth = getDaysInMonth(year, month);
  const deptMap = Object.fromEntries(appState.departamentos.map(d => [d.id, d.nome]));
  const employees = getFilteredAndSortedEmployees(true);

  // Construção do Cabeçalho Duplo (ambas as linhas possuem células sticky correspondentes para evitar que os dias atravessem a coluna DSR)
  let row1 = '<tr><th class="col-dept col-corner-top">Departamento</th><th class="col-badge col-corner-top">Crachá</th><th class="col-name col-corner-top">Colaborador</th>';
  let row2 = '<tr><th class="col-dept col-corner-sub" aria-hidden="true">&nbsp;</th><th class="col-badge col-corner-sub" aria-hidden="true">&nbsp;</th><th class="col-name col-corner-sub" aria-hidden="true">&nbsp;</th>';

  for (let d = 1; d <= daysInMonth; d++) {
    const isoStr = formatDateISO(year, month, d);
    const dateObj = new Date(isoStr + 'T12:00:00');
    const dayOfWeek = dateObj.getDay();
    const dayOfWeekName = DIAS_SEMANA_SIGLA[dayOfWeek];
    const isSunday = dayOfWeek === 0;
    const holiday = isHoliday(isoStr, appState.activeBranchId);

    let thClass = 'th-date-clickable';
    let titleHint = "Clique no dia " + String(d).padStart(2, '0') + " para aplicar 'OK' em massa para os colaboradores filtrados";

    if (isSunday) {
      thClass += ' th-sunday';
      titleHint = 'Domingo (DSR Automático)';
    } else if (holiday) {
      thClass += ' th-feriado';
      titleHint = 'Feriado: ' + holiday.nome;
    }

    const dayNumStr = String(d).padStart(2, '0');
    row1 += '<th class="' + thClass + '" data-date="' + isoStr + '" data-sunday="' + (isSunday ? '1' : '0') + '" data-holiday="' + (holiday ? '1' : '0') + '" title="' + titleHint + '">' + dayNumStr + '</th>';
    row2 += '<th class="' + (isSunday ? 'th-sunday' : (holiday ? 'th-feriado' : '')) + '" data-date="' + isoStr + '">' + dayOfWeekName + '</th>';
  }

  row1 += '<th class="col-dsr col-corner-top" title="Total de DSRs perdidos/descontados no mês">Qtd. DSR</th></tr>';
  row2 += '<th class="col-dsr col-corner-sub" title="Total de DSRs perdidos/descontados no mês" aria-hidden="true">&nbsp;</th></tr>';

  thead.innerHTML = row1 + row2;

  // Ouvintes de clique nos dias do cabeçalho (Ação em Massa por Data e Seleção de Coluna)
  thead.querySelectorAll('th[data-date]').forEach(th => {
    th.addEventListener('click', () => {
      const isoDate = th.dataset.date;
      applyMatrixSelection(selectedMatrixColabId, isoDate);

      if (th.classList.contains('th-date-clickable') && th.dataset.sunday !== '1' && th.dataset.holiday !== '1') {
        openMassOverrideModal(isoDate);
      } else if (th.dataset.holiday === '1') {
        const hObj = isHoliday(isoDate, appState.activeBranchId);
        showToast('Feriados cadastrados (' + (hObj?.nome || 'Feriado') + ') não permitem aplicação em massa. Para alterar, gerencie o feriado no cadastro de feriados.', 'info');
      }
    });
  });

  // Construção do Corpo da Tabela
  tbody.innerHTML = '';

  if (employees.length === 0) {
    const totalCols = daysInMonth + 4;
    tbody.innerHTML = '<tr><td colspan="' + totalCols + '" class="empty-state"><div class="empty-state-icon">📋</div><p>Nenhum colaborador encontrado com os filtros atuais nesta filial.</p><div style="margin-top: 10px; display: flex; gap: 8px; justify-content: center;"><button class="btn btn-cyan btn-sm" id="btn-empty-switch-matriz">Ir para Matriz (56 Colaboradores)</button><button class="btn btn-secondary btn-sm" id="btn-empty-reset-filters">Limpar Filtros</button></div></td></tr>';
    tbody.querySelector('#btn-empty-switch-matriz')?.addEventListener('click', () => {
      appState.activeBranchId = 'branch-1';
      resetMainAndColabFilters(false);
      saveStateToStorage();
      renderCurrentView();
    });
    tbody.querySelector('#btn-empty-reset-filters')?.addEventListener('click', () => {
      resetMainAndColabFilters(true);
    });
    return;
  }

  employees.forEach(colab => {
    const deptName = deptMap[colab.deptId] || 'Geral';
    const tr = document.createElement('tr');
    tr.setAttribute('data-colab-id', colab.id);

    let html = '<td class="col-dept" data-colab-id="' + colab.id + '" title="' + deptName + '">' + deptName + '</td><td class="col-badge" data-colab-id="' + colab.id + '">' + colab.cracha + '</td><td class="col-name" data-colab-id="' + colab.id + '" title="' + colab.nome + '"><strong>' + colab.nome + '</strong></td>';

    // Células de Dias
    for (let d = 1; d <= daysInMonth; d++) {
      const isoStr = formatDateISO(year, month, d);
      const resolved = getResolvedDayStatus(colab.id, isoStr, appState.activeBranchId);

      html += '<td data-date="' + isoStr + '" data-colab-id="' + colab.id + '"><div class="cell-ponto ' + resolved.cssClass + '" data-colab-id="' + colab.id + '" data-colab-name="' + colab.nome + '" data-date="' + isoStr + '" data-sunday="' + (resolved.isSunday ? '1' : '0') + '" data-holiday="' + (resolved.isHoliday ? '1' : '0') + '" data-disabled="' + (resolved.isDisabled ? '1' : '0') + '" data-dismissed="' + (resolved.isDismissed ? '1' : '0') + '" title="' + colab.nome + ' - ' + formatDateBR(isoStr) + ': ' + resolved.display + (resolved.holidayName ? ' (' + resolved.holidayName + ')' : '') + '">' + resolved.display + '</div></td>';
    }

    // Coluna Congelada à Direita: Qtd. DSR
    const dsrInfo = calculateDsrAndOccurrences(colab.id, year, month, appState.activeBranchId);
    const hasDesconto = hasDescontoNoMes(dsrInfo);
    let dsrClass = 'dsr-penalty';
    let dsrTooltip = dsrInfo.dsrBreakdown.join('&#10;');
    if (dsrInfo.totalDsrLost === 0) {
      dsrClass = 'dsr-zero' + (hasDesconto ? ' dsr-has-desconto' : '');
      dsrTooltip = hasDesconto
        ? 'DSR zerado, PORÉM há desconto no mês: ' + dsrInfo.faltasIntegrais + ' falta(s) integral(is), ' + dsrInfo.faltasMeioPeriodo + ' falta(s) de meio período, atrasos ' + minutesToTime(dsrInfo.totalAtrasosMinutos)
        : 'Nenhuma perda de DSR no mês';
    }

    html += '<td class="col-dsr" data-colab-id="' + colab.id + '" title="' + dsrTooltip + ' (Clique para abrir detalhamento analítico)"><span class="dsr-badge ' + dsrClass + '">' + dsrInfo.totalDsrLost + '</span></td>';

    tr.innerHTML = html;

    // Seleção de linha ao clicar nas colunas do funcionário (nome, crachá, departamento)
    tr.querySelectorAll('.col-dept, .col-badge, .col-name').forEach(td => {
      td.addEventListener('click', () => {
        // Ao clicar no funcionário, a linha dele é selecionada e a coluna/dia previamente selecionada acompanha!
        applyMatrixSelection(colab.id, selectedMatrixDate);
      });
    });

    tbody.appendChild(tr);
  });

  // Cliques nas células individuais de ponto
  tbody.querySelectorAll('.cell-ponto').forEach(cell => {
    cell.addEventListener('click', () => {
      const colabId = cell.dataset.colabId;
      const isoDate = cell.dataset.date;
      const wasAlreadySelected = (selectedMatrixColabId === colabId && selectedMatrixDate === isoDate);

      // 1. Sempre atualiza a linha e a coluna/dia selecionada
      applyMatrixSelection(colabId, isoDate);

      // 2. Se a célula NÃO estava selecionada previamente, o 1º clique apenas seleciona!
      if (!wasAlreadySelected) {
        return;
      }

      // 3. Se o usuário clicou na célula que JÁ ESTÁ selecionada, aí sim abre o modal de pendências
      if (cell.dataset.holiday === '1' || isHoliday(isoDate, appState.activeBranchId)) {
        const hObj = isHoliday(isoDate, appState.activeBranchId);
        showToast('Feriados cadastrados (' + (hObj?.nome || 'Feriado') + ') não podem ser modificados pelo dashboard. Para alterar este dia, exclua o feriado no cadastro de feriados.', 'warning');
        return;
      }
      if (cell.dataset.sunday === '1') {
        showToast('Dias de descanso obrigatório (DSR / Folga) não permitem alteração manual.', 'info');
        return;
      }
      if (cell.dataset.disabled === '1') {
        showToast('Data anterior à admissão do colaborador.', 'warning');
        return;
      }
      if (cell.dataset.dismissed === '1') {
        showToast('Colaborador desligado nesta data.', 'warning');
        return;
      }
      openCellDetailModal(colabId, isoDate);
    });
  });

  // Cliques na coluna congelada de DSR para abrir detalhamento analítico
  tbody.querySelectorAll('.col-dsr').forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      const colabId = cell.dataset.colabId;
      if (colabId) {
        applyMatrixSelection(colabId, selectedMatrixDate);
        openDsrDetailsModal(colabId);
      }
    });
  });

  // Re-aplica a seleção persistida (linha, coluna e célula) após renderização
  applyMatrixSelection(selectedMatrixColabId, selectedMatrixDate);
}

// ==========================================================================
// 6. RENDERIZAÇÃO DO VALE ALIMENTAÇÃO (DASHBOARD SECUNDÁRIO)
// ==========================================================================
function renderVAView() {
  const tbody = document.getElementById('va-tbody');
  if (!tbody) return;

  const year = appState.currentYear;
  const month = appState.currentMonth;
  const branchId = appState.activeBranchId;
  const employees = getFilteredAndSortedEmployees(false);
  const deptMap = Object.fromEntries(appState.departamentos.map(d => [d.id, d.nome]));

  let sumColab = employees.length;
  let sumDiasUteis = 0;
  let sumPotencial = 0;
  let sumLiquido = 0;
  let sumDesconto = 0;

  tbody.innerHTML = '';

  if (employees.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><div class="empty-state-icon">💳</div><p>Nenhum colaborador encontrado para fechamento de VA nesta filial.</p><div style="margin-top: 10px; display: flex; gap: 8px; justify-content: center;"><button class="btn btn-cyan btn-sm" id="btn-va-switch-matriz">Ir para Matriz (56 Colaboradores)</button><button class="btn btn-secondary btn-sm" id="btn-va-reset-filters">Limpar Filtros</button></div></td></tr>';
    tbody.querySelector('#btn-va-switch-matriz')?.addEventListener('click', () => {
      appState.activeBranchId = 'branch-1';
      resetMainAndColabFilters(false);
      saveStateToStorage();
      renderCurrentView();
    });
    tbody.querySelector('#btn-va-reset-filters')?.addEventListener('click', () => {
      resetMainAndColabFilters(true);
    });
    updateVAKpis(0, 0, 0, 0, 0);
    return;
  }

  employees.forEach(colab => {
    const va = calculateVAForEmployee(colab.id, year, month, branchId);
    sumDiasUteis = Math.max(sumDiasUteis, va.totalBusinessDays);
    sumPotencial += va.potencialMaximo;
    sumLiquido += va.valorLiquido;
    sumDesconto += va.valorDescontado;

    const deptName = deptMap[colab.deptId] || 'Geral';

    let extraBadge = '';
    if (colab.aprendiz || colab.isAprendiz) {
      const sabadoTxt = isColabFolgaSabado(colab) ? ' (Folga Sáb)' : ' (Trabalha Sáb)';
      extraBadge += '<span class="badge-aprendiz" style="font-size:10px; margin-left:6px; background:rgba(245, 158, 11, 0.2); color:#FDE047; border:1px solid rgba(245, 158, 11, 0.5); padding:1px 5px; border-radius:3px;" title="Jovem Aprendiz: Meio período (R$ 4,00/dia útil)">Aprendiz' + sabadoTxt + '</span>';
    } else if (isColabFolgaSabado(colab)) {
      extraBadge += '<span class="badge-sabado-folga" style="font-size:10px; margin-left:6px; background:rgba(99, 102, 241, 0.2); color:#C7D2FE; border:1px solid rgba(99, 102, 241, 0.4); padding:1px 5px; border-radius:3px;" title="Não trabalha aos sábados">Folga Sábado</span>';
    }
    if (colab.naoRecebeVa || colab.recebeVa === false) {
      extraBadge += '<span class="badge-sem-va" title="Colaborador configurado para não receber Vale Alimentação">Sem VA</span>';
    }
    if (colab.registraPonto === false) {
      extraBadge += '<span class="badge-ponto-nao" style="font-size:10px; margin-left:6px;" title="Isento de registro de ponto">Isento Ponto</span>';
    }
    if (colab.status === 'demitido') {
      extraBadge += '<span class="badge-demitido" style="font-size:10px; margin-left:6px;" title="Demitido em ' + formatDateBR(colab.dataDemissao) + '">Demitido ' + formatDateBR(colab.dataDemissao) + '</span>';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = '<td style="font-family: var(--font-mono); font-weight: 600;">' + colab.cracha + '</td><td><strong>' + colab.nome + '</strong>' + extraBadge + '</td><td>' + deptName + '</td><td class="text-center">' + va.totalBusinessDays + '</td><td class="text-center">' + va.fullDaysWorked + '</td><td class="text-center">' + va.halfDaysWorked + '</td><td class="text-center">' + va.absenceDays + '</td><td class="text-right val-liquido">R$ ' + va.valorLiquido.toFixed(2).replace('.', ',') + '</td><td class="text-right val-desconto">R$ ' + va.valorDescontado.toFixed(2).replace('.', ',') + '</td><td class="text-center"><button class="btn btn-secondary btn-sm btn-audit-va" data-colab-id="' + colab.id + '" title="Ver extrato diário analítico">🔍 Extrato</button></td>';
    tbody.appendChild(tr);
  });

  updateVAKpis(sumColab, sumDiasUteis, sumPotencial, sumLiquido, sumDesconto);

  // Botões de extrato
  tbody.querySelectorAll('.btn-audit-va').forEach(btn => {
    btn.addEventListener('click', () => {
      openVAAuditModal(btn.dataset.colabId);
    });
  });
}

function updateVAKpis(colabCount, diasUteis, potencial, liquido, desconto) {
  const branch = appState.filiais.find(f => f.id === appState.activeBranchId);
  const kpiTotal = document.getElementById('kpi-total-colab');
  if (kpiTotal) kpiTotal.textContent = colabCount;
  const kpiSub = document.getElementById('kpi-sub-filial');
  if (kpiSub) kpiSub.textContent = branch ? branch.nome : 'Filial Selecionada';
  const kpiDias = document.getElementById('kpi-dias-uteis');
  if (kpiDias) kpiDias.textContent = diasUteis;
  const kpiPot = document.getElementById('kpi-potencial-bruto');
  if (kpiPot) kpiPot.textContent = 'R$ ' + potencial.toFixed(2).replace('.', ',');
  const kpiLiq = document.getElementById('kpi-total-liquido');
  if (kpiLiq) kpiLiq.textContent = 'R$ ' + liquido.toFixed(2).replace('.', ',');
  const kpiDesc = document.getElementById('kpi-total-desconto');
  if (kpiDesc) kpiDesc.textContent = 'R$ ' + desconto.toFixed(2).replace('.', ',');
}

// Modal de Extrato Diário do VA
function openVAAuditModal(colabId) {
  const colab = appState.colaboradores.find(c => c.id === colabId);
  if (!colab) return;

  const va = calculateVAForEmployee(colabId, appState.currentYear, appState.currentMonth, appState.activeBranchId);
  const deptMap = Object.fromEntries(appState.departamentos.map(d => [d.id, d.nome]));

  const isAprendiz = colab.aprendiz || colab.isAprendiz;
  const aprendizLabel = isAprendiz ? ' • <span style="color:#FDE047; font-weight:700;">🎓 Jovem Aprendiz (R$ 4,00/dia)</span>' : '';
  const folgaSabLabel = isColabFolgaSabado(colab) ? ' • <span style="color:#A5B4FC; font-weight:700;">🏖️ Folga aos Sábados</span>' : '';
  const vaStatusLabel = (colab.naoRecebeVa || colab.recebeVa === false) ? ' • <span style="color:#FCA5A5; font-weight:700;">🚫 Não recebe Vale Alimentação</span>' : '';

  const summary = document.getElementById('va-audit-summary');
  summary.innerHTML = '<div><strong style="color:var(--color-cyan); font-size:14px;">' + colab.nome + '</strong> (Crachá: ' + colab.cracha + ')<div style="font-size:11px; color:var(--color-text-sub);">Setor: ' + (deptMap[colab.deptId] || '') + aprendizLabel + folgaSabLabel + vaStatusLabel + ' • Mês: ' + MESES_PT[appState.currentMonth] + '/' + appState.currentYear + (colab.status === 'demitido' ? ' • Desligado em: ' + formatDateBR(colab.dataDemissao) : '') + '</div></div><div style="text-align:right;"><span style="font-size:11px; color:var(--color-text-muted);">Líquido a Pagar:</span><div style="color:var(--color-cyan); font-family:var(--font-mono); font-size:16px; font-weight:700;">R$ ' + va.valorLiquido.toFixed(2).replace('.', ',') + '</div><div style="font-size:10px; color:#B4A6CF;">Descontos: R$ ' + va.valorDescontado.toFixed(2).replace('.', ',') + '</div></div>';

  const tbody = document.getElementById('va-audit-tbody');
  tbody.innerHTML = '';
  va.dailyAudit.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td style="font-family: var(--font-mono);">' + item.dateStr + '</td><td>' + item.dayOfWeek + '</td><td>' + (item.isBusinessDay ? 'Dia Útil' : 'Não Útil / Inativo') + '</td><td><span style="display:inline-block; font-size:10px; padding:1px 6px; border-radius:3px; background:#2F2D33; color:var(--color-cyan); font-weight:600;">' + item.resolvedType + '</span></td><td class="text-right val-liquido">R$ ' + item.creditado.toFixed(2).replace('.', ',') + '</td><td class="text-right val-desconto">R$ ' + item.descontado.toFixed(2).replace('.', ',') + '</td><td style="font-size:11px; color:var(--color-text-sub);">' + item.note + '</td>';
    tbody.appendChild(tr);
  });

  openModal('modal-va-audit');
}

// ==========================================================================
// 7. MODAIS E CONTROLES DE PONTO
// ==========================================================================
let activeMassDate = null;

function openMassOverrideModal(isoDate) {
  activeMassDate = isoDate;
  const branch = appState.filiais.find(f => f.id === appState.activeBranchId);
  const branchName = branch ? branch.nome : 'esta filial';
  const filtered = getFilteredAndSortedEmployees(true);
  const desc = document.getElementById('mass-modal-desc');
  desc.innerHTML = 'Deseja definir o status como <strong>"OK"</strong> para os <strong>' + filtered.length + ' colaborador(es) filtrados</strong> no momento na filial <em>"' + branchName + '"</em> no dia <strong>' + formatDateBR(isoDate) + '</strong>?';
  openModal('modal-mass-override');
}

/**
 * Verifica se o dia do colaborador já possui algum registro (Atestado, Férias, Falta, Atraso,
 * Afastamento, abono etc.). Nesses casos o "OK em massa" NÃO sobrepõe o registro existente.
 */
function dayHasExistingRecord(colabId, isoDate) {
  if (isHoliday(isoDate, appState.activeBranchId)) return true;
  const reg = getPontoRecord(colabId, isoDate);
  if (reg) {
    if (reg.override && !['AUTO', 'OK', 'VAZIO'].includes(reg.override)) return true;
    if (reg.resolution && reg.resolution !== 'NENHUMA') return true;
    if (reg.override !== 'AUTO') {
      if ((Number(reg.atrasoMaiorMin) || 0) > 0 || (Number(reg.atrasoPequenoMin) || 0) > 0) return true;
      if (parseTimeToMinutes(reg.atrasoMaior || '') > 0 || parseTimeToMinutes(reg.atrasoPequeno || '') > 0) return true;
    }
  }
  const status = getDayStatus(colabId, isoDate, appState.activeBranchId);
  return !(status.type === 'OK' || status.type === 'VAZIO');
}

document.getElementById('btn-confirm-mass-ok')?.addEventListener('click', () => {
  if (!activeMassDate) return;

  const massDateObj = new Date(activeMassDate + 'T12:00:00');
  const isSaturday = massDateObj.getDay() === 6;

  // Apenas os colaboradores que estão sendo exibidos no filtro atual da matriz
  const filteredEmployees = getFilteredAndSortedEmployees(true);
  let applied = 0;
  let preserved = 0;

  filteredEmployees.forEach(colab => {
    if (colab.registraPonto === false) return;
    if (isHoliday(activeMassDate, colab.filialId || appState.activeBranchId)) return;
    if (colab.status === 'demitido' && colab.dataDemissao && activeMassDate > colab.dataDemissao) return;
    if (colab.admissao && activeMassDate < colab.admissao) return;

    // Se for sábado e o colaborador tem folga aos sábados (aprendiz ou escala sem sábado), mantém travado como descanso
    if (isSaturday && isColabFolgaSabado(colab)) return;

    const regKey = colab.id + '_' + activeMassDate;
    const existing = appState.registrosPonto[regKey];

    // Não sobrepõe dias que já possuem algo (Atestado, Férias, Falta, Atraso, Feriado etc.)
    if (dayHasExistingRecord(colab.id, activeMassDate)) {
      preserved++;
      return;
    }
    if (existing && existing.override === 'OK') return; // Já está OK

    const dw = massDateObj.getDay() + 1;
    const colabSchedule = colab?.horariosSemana ? (colab.horariosSemana[dw] || colab.horariosSemana[String(dw)]) : null;
    let mE1 = colabSchedule?.e1 || '08:00';
    let mS1 = colabSchedule?.s1 || '12:00';
    let mE2 = colabSchedule?.e2 || (mS1 === '11:00' ? '13:00' : (isSaturday ? '' : '14:00'));
    let mS2 = colabSchedule?.s2 || (mE2 === '13:00' ? '17:00' : (isSaturday ? '' : '18:00'));

    appState.registrosPonto[regKey] = {
      override: 'OK',
      resolution: 'NENHUMA',
      punches: { em: mE1, sm: mS1, et: mE2, st: mS2 },
      note: 'OK em massa pelo cabeçalho da data'
    };
    applied++;
  });

  saveStateToStorage();
  closeModal('modal-mass-override');
  renderCurrentView();
  showToast('"OK" aplicado para ' + applied + ' colaborador(es) filtrados em ' + formatDateBR(activeMassDate) + (preserved > 0 ? ' • ' + preserved + ' registro(s) existente(s) preservado(s)' : ''), 'success');
});

let currentEditingCell = { colabId: null, isoDate: null };

function openCellDetailModal(colabId, isoDate) {
  currentEditingCell = { colabId, isoDate };

  const colab = appState.colaboradores.find(c => c.id === colabId);
  if (!colab) return;

  const branchId = colab.filialId || appState.activeBranchId;
  const holiday = isHoliday(isoDate, branchId);
  if (holiday) {
    showToast('Feriado cadastrado (' + holiday.nome + '): Não é permitido alterar manualmente pelo dashboard. Para modificar, exclua o feriado no cadastro de feriados.', 'warning');
    return;
  }

  const branch = appState.filiais.find(f => f.id === colab.filialId);
  const dept = appState.departamentos.find(d => d.id === colab.deptId);
  const dateObj = new Date(isoDate + 'T12:00:00');
  const dayOfWeekName = DIAS_SEMANA_SIGLA[dateObj.getDay()];

  document.getElementById('modal-colab-name').textContent = colab.nome;
  document.getElementById('modal-colab-sub').textContent = 'Crachá: ' + colab.cracha + ' • Depto: ' + (dept ? dept.nome : '') + ' • Filial: ' + (branch ? branch.nome : '');
  document.getElementById('modal-date-display').textContent = formatDateBR(isoDate) + ' (' + dayOfWeekName + ')';

  // Configurar exibição dinâmica do Quadro de Horário do NGPonto
  const dw = dateObj.getDay() + 1; // 1=Dom .. 7=Sab
  let horarioDia = null;
  if (colab.horariosSemana) {
    horarioDia = colab.horariosSemana[dw] || colab.horariosSemana[String(dw)];
  }

  const qTextEl = document.getElementById('modal-quadro-text');
  const hintEmEl = document.getElementById('hint-em');
  const hintSmEl = document.getElementById('hint-sm');
  const hintEtEl = document.getElementById('hint-et');
  const hintStEl = document.getElementById('hint-st');

  let expE1 = '08:00', expS1 = '12:00', expE2 = '14:00', expS2 = '18:00', expDesc = (dw === 1);

  if (horarioDia) {
    expE1 = horarioDia.e1 || '';
    expS1 = horarioDia.s1 || '';
    expE2 = horarioDia.e2 || '';
    expS2 = horarioDia.s2 || '';
    expDesc = !!horarioDia.descanso;
  } else if (colab.quadroNG) {
    const parts = colab.quadroNG.split(/\s+/).filter(Boolean);
    if (parts.length >= 4) {
      expE1 = parts[0]; expS1 = parts[1]; expE2 = parts[2]; expS2 = parts[3];
    }
  }

  if (qTextEl) {
    if (expDesc) {
      qTextEl.textContent = 'Descanso Semanal Remunerado (DSR / Folga)';
    } else if (expE1 && expS1 && expE2 && expS2) {
      qTextEl.textContent = `${expE1} às ${expS1} / ${expE2} às ${expS2}`;
    } else if (expE1 && expS1) {
      qTextEl.textContent = `${expE1} às ${expS1} (Meio Período)`;
    } else {
      qTextEl.textContent = '08:00 às 12:00 / 14:00 às 18:00 (Padrão)';
    }
  }

  if (hintEmEl) hintEmEl.textContent = 'Quadro: ' + (expE1 || '--:--');
  if (hintSmEl) hintSmEl.textContent = 'Quadro: ' + (expS1 || '--:--');
  if (hintEtEl) hintEtEl.textContent = 'Quadro: ' + (expE2 || '--:--');
  if (hintStEl) hintStEl.textContent = 'Quadro: ' + (expS2 || '--:--');

  // Armazena no modal para uso dos botões de preenchimento rápido
  currentEditingCell.quadroDia = { e1: expE1, s1: expS1, e2: expE2, s2: expS2, descanso: expDesc };

  const reg = getPontoRecord(colabId, isoDate) || {
    override: 'AUTO',
    resolution: 'NENHUMA',
    punches: { em: expE1, sm: expS1, et: expE2, st: expS2 },
    note: ''
  };

  let initialOverride = reg.override || 'AUTO';
  document.getElementById('select-override-status').value = initialOverride;
  const selOverride2 = document.getElementById('select-override-status-2');
  if (selOverride2) selOverride2.value = reg.override2 || '';
  syncPendencia2State();
  document.getElementById('select-resolution').value = reg.resolution || 'NENHUMA';
  document.getElementById('input-cell-justificativa').value = reg.note || '';

  if (initialOverride === 'VAZIO') {
    document.getElementById('punch-em').value = '';
    document.getElementById('punch-sm').value = '';
    document.getElementById('punch-et').value = '';
    document.getElementById('punch-st').value = '';
  } else {
    document.getElementById('punch-em').value = reg.punches?.em || '';
    document.getElementById('punch-sm').value = reg.punches?.sm || '';
    document.getElementById('punch-et').value = reg.punches?.et || '';
    document.getElementById('punch-st').value = reg.punches?.st || '';
  }

  // Carrega campos de atraso maior e pequeno atraso
  const inputAtrasoMaior = document.getElementById('input-atraso-maior');
  const inputAtrasoPequeno = document.getElementById('input-atraso-pequeno');

  let defaultAtrasoMaior = '';
  if (initialOverride === 'AUTO' && reg.punches) {
    const evalResult = evaluateDailyPunches(reg.punches, horarioDia || reg?.esperado || colab?.quadroNG);
    if (evalResult.status === 'ATRASO' && evalResult.delayMinutes > 0) {
      defaultAtrasoMaior = minutesToTime(evalResult.delayMinutes);
    }
  } else if (reg.atrasoMaiorMin > 0) {
    defaultAtrasoMaior = minutesToTime(reg.atrasoMaiorMin);
  } else if (reg.atrasoMaior) {
    const m = parseTimeToMinutes(reg.atrasoMaior);
    if (m > 0) defaultAtrasoMaior = minutesToTime(m);
  } else if (!reg.atrasoPequeno && reg.punches && initialOverride !== 'VAZIO') {
    const evalResult = evaluateDailyPunches(reg.punches, horarioDia || reg?.esperado || colab?.quadroNG);
    if (evalResult.status === 'ATRASO' && evalResult.delayMinutes > 0) {
      defaultAtrasoMaior = minutesToTime(evalResult.delayMinutes);
    }
  }

  let defaultAtrasoPequeno = '';
  if (reg.atrasoPequenoMin > 0) {
    defaultAtrasoPequeno = minutesToTime(reg.atrasoPequenoMin);
  } else if (reg.atrasoPequeno) {
    const m = parseTimeToMinutes(reg.atrasoPequeno);
    if (m > 0) defaultAtrasoPequeno = minutesToTime(m);
  }

  if (inputAtrasoMaior) {
    inputAtrasoMaior.value = defaultAtrasoMaior;
    if (defaultAtrasoMaior && defaultAtrasoMaior !== '00:00') inputAtrasoMaior.dataset.hadInitialValue = '1';
    else delete inputAtrasoMaior.dataset.hadInitialValue;
  }
  if (inputAtrasoPequeno) {
    inputAtrasoPequeno.value = defaultAtrasoPequeno;
    if (defaultAtrasoPequeno && defaultAtrasoPequeno !== '00:00') inputAtrasoPequeno.dataset.hadInitialValue = '1';
    else delete inputAtrasoPequeno.dataset.hadInitialValue;
  }

  const currentStatus = getDayStatus(colabId, isoDate, appState.activeBranchId);
  document.getElementById('modal-status-badge').textContent = 'Status Apurado: ' + currentStatus.display;

  document.getElementById('check-replicate-days').checked = false;
  document.getElementById('input-replicate-count').value = 1;

  openModal('modal-cell-detail');
}

// Pendência 2 só é habilitada quando a Pendência 1 é uma pendência/falta
function syncPendencia2State() {
  const p1 = document.getElementById('select-override-status')?.value;
  const sel2 = document.getElementById('select-override-status-2');
  if (!sel2) return;
  const allowed = !!p1 && !['AUTO', 'OK', 'FÉRIAS', 'AFASTADO', 'VAZIO'].includes(p1);
  sel2.disabled = !allowed;
  if (!allowed) sel2.value = '';
  if (allowed && sel2.value === p1) sel2.value = '';
}

function recalculateModalDelayIfAuto() {
  const selStatus = document.getElementById('select-override-status')?.value;
  if (selStatus !== 'AUTO') return;
  const inMaior = document.getElementById('input-atraso-maior');
  if (!inMaior) return;

  const curPunches = {
    em: document.getElementById('punch-em')?.value || '',
    sm: document.getElementById('punch-sm')?.value || '',
    et: document.getElementById('punch-et')?.value || '',
    st: document.getElementById('punch-st')?.value || ''
  };
  const q = currentEditingCell?.quadroDia;
  const colab = appState.colaboradores.find(c => c.id === currentEditingCell?.colabId);
  const dw = currentEditingCell?.isoDate ? (new Date(currentEditingCell.isoDate + 'T12:00:00')).getDay() + 1 : 1;
  const colabSchedule = q || (colab?.horariosSemana ? (colab.horariosSemana[dw] || colab.horariosSemana[String(dw)]) : null) || colab?.quadroNG;

  const evalResult = evaluateDailyPunches(curPunches, colabSchedule);
  if (evalResult.status === 'ATRASO' && evalResult.delayMinutes > 0) {
    inMaior.value = minutesToTime(evalResult.delayMinutes);
  } else {
    inMaior.value = '';
  }
}

['punch-em', 'punch-sm', 'punch-et', 'punch-st'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', recalculateModalDelayIfAuto);
    el.addEventListener('change', recalculateModalDelayIfAuto);
  }
});

document.getElementById('select-override-status')?.addEventListener('change', (e) => {
  const val = e.target.value;
  if (val === 'VAZIO') {
    // Ao selecionar VAZIO, limpa imediatamente os horários de batida e atrasos na interface
    document.getElementById('punch-em').value = '';
    document.getElementById('punch-sm').value = '';
    document.getElementById('punch-et').value = '';
    document.getElementById('punch-st').value = '';
    const inMaior = document.getElementById('input-atraso-maior');
    const inPequeno = document.getElementById('input-atraso-pequeno');
    if (inMaior) { inMaior.value = ''; delete inMaior.dataset.hadInitialValue; }
    if (inPequeno) { inPequeno.value = ''; delete inPequeno.dataset.hadInitialValue; }
  } else if (val === 'OK') {
    // Ao marcar OK no dia, preenche os horários com a ESCALA EXATA PREVISTA do colaborador para este dia!
    const q = currentEditingCell?.quadroDia;
    if (q) {
      document.getElementById('punch-em').value = q.e1 || '';
      document.getElementById('punch-sm').value = q.s1 || '';
      document.getElementById('punch-et').value = q.e2 || '';
      document.getElementById('punch-st').value = q.s2 || '';
    }
    const inMaior = document.getElementById('input-atraso-maior');
    const inPequeno = document.getElementById('input-atraso-pequeno');
    if (inMaior) { inMaior.value = ''; delete inMaior.dataset.hadInitialValue; }
    if (inPequeno) { inPequeno.value = ''; delete inPequeno.dataset.hadInitialValue; }
  } else if (val === 'AUTO') {
    recalculateModalDelayIfAuto();
  }
  syncPendencia2State();
  commitAndSaveCellDetail(false, true);
});

document.getElementById('select-override-status-2')?.addEventListener('change', (e) => {
  const p1 = document.getElementById('select-override-status')?.value;
  if (e.target.value && e.target.value === p1) {
    e.target.value = '';
    showToast('A Pendência 2 deve ser diferente da Pendência 1.', 'warning');
  }
});

/**
 * Grava e persiste imediatamente a célula de ponto em edição (Auto-Save Total)
 */
function commitAndSaveCellDetail(closeAfterSave = false, showFeedback = true) {
  const { colabId, isoDate } = currentEditingCell;
  if (!colabId || !isoDate) return;

  const colab = appState.colaboradores.find(c => c.id === colabId);
  const branchId = colab?.filialId || appState.activeBranchId;

  if (isHoliday(isoDate, branchId)) {
    if (showFeedback) showToast('Não é permitido alterar manualmente registros em dias de feriado cadastrado.', 'error');
    return;
  }

  let override = document.getElementById('select-override-status')?.value || 'AUTO';
  let override2 = document.getElementById('select-override-status-2')?.value || '';
  if (['AUTO', 'OK', 'FÉRIAS', 'AFASTADO', 'VAZIO'].includes(override) || override2 === override) override2 = '';
  const resolution = document.getElementById('select-resolution')?.value || 'NENHUMA';
  const note = (document.getElementById('input-cell-justificativa')?.value || '').trim();

  let atrasoMaiorRaw = normalizeTimeInput((document.getElementById('input-atraso-maior')?.value || '').trim());
  let atrasoPequenoRaw = normalizeTimeInput((document.getElementById('input-atraso-pequeno')?.value || '').trim());

  let atrasoMaiorMin = parseTimeToMinutes(atrasoMaiorRaw);
  let atrasoPequenoMin = parseTimeToMinutes(atrasoPequenoRaw);

  let punches = {
    em: document.getElementById('punch-em')?.value || '',
    sm: document.getElementById('punch-sm')?.value || '',
    et: document.getElementById('punch-et')?.value || '',
    st: document.getElementById('punch-st')?.value || ''
  };

  if (override === 'VAZIO') {
    punches = { em: '', sm: '', et: '', st: '' };
    atrasoMaiorRaw = '';
    atrasoPequenoRaw = '';
    atrasoMaiorMin = 0;
    atrasoPequenoMin = 0;
  } else if (override === 'OK') {
    atrasoMaiorRaw = '';
    atrasoPequenoRaw = '';
    atrasoMaiorMin = 0;
    atrasoPequenoMin = 0;
  } else if (override === 'AUTO') {
    const dw = (new Date(isoDate + 'T12:00:00')).getDay() + 1;
    const q = currentEditingCell?.quadroDia;
    const colabSchedule = q || (colab?.horariosSemana ? (colab.horariosSemana[dw] || colab.horariosSemana[String(dw)]) : null) || colab?.quadroNG;
    const evalRes = evaluateDailyPunches(punches, colabSchedule);
    if (evalRes.status === 'ATRASO' && evalRes.delayMinutes > 0) {
      atrasoMaiorMin = evalRes.delayMinutes;
      atrasoMaiorRaw = minutesToTime(evalRes.delayMinutes);
    } else {
      atrasoMaiorMin = 0;
      atrasoMaiorRaw = '';
    }
  }

  const regKey = colabId + '_' + isoDate;
  const regPayload = {
    override,
    override2,
    resolution,
    punches,
    note,
    atrasoMaior: atrasoMaiorRaw,
    atrasoMaiorMin,
    atrasoPequeno: atrasoPequenoRaw,
    atrasoPequenoMin
  };
  appState.registrosPonto[regKey] = regPayload;
  if (colab && colab.cracha) {
    appState.registrosPonto['colab-' + colab.cracha + '_' + isoDate] = regPayload;
  }

  const shouldReplicate = document.getElementById('check-replicate-days')?.checked;
  const replicateCount = parseInt(document.getElementById('input-replicate-count')?.value, 10) || 1;

  if (shouldReplicate && replicateCount > 0) {
    const curDate = new Date(isoDate + 'T12:00:00');
    let added = 0;
    for (let i = 1; added < replicateCount && i <= 40; i++) {
      const nextDate = new Date(curDate);
      nextDate.setDate(curDate.getDate() + i);
      if (nextDate.getDay() === 0) continue;
      const nextIso = nextDate.toISOString().split('T')[0];
      if (isHoliday(nextIso, branchId)) continue;
      if (colab && colab.status === 'demitido' && colab.dataDemissao && nextIso > colab.dataDemissao) continue;

      const nextKey = colabId + '_' + nextIso;
      const nextPayload = {
        override,
        override2,
        resolution,
        punches: { ...punches },
        note: note + ' (Replicado de ' + formatDateBR(isoDate) + ')',
        atrasoMaior: atrasoMaiorRaw,
        atrasoMaiorMin,
        atrasoPequeno: atrasoPequenoRaw,
        atrasoPequenoMin
      };
      appState.registrosPonto[nextKey] = nextPayload;
      if (colab && colab.cracha) {
        appState.registrosPonto['colab-' + colab.cracha + '_' + nextIso] = nextPayload;
      }
      added++;
    }
  }

  // 1. Salva atomicamente no LocalStorage e no Servidor Local em disco imediatamente
  saveStateToStorage(true, true, true);

  if (closeAfterSave) {
    clearModalDraft();
    closeModal('modal-cell-detail');
  }

  // 2. Atualiza a visualização da tela
  renderCurrentView();

  if (typeof impState !== 'undefined' && impState.pendenciasRaw) {
    impState.pendenciasCache = filtrarPendenciasComDashboardApp(impState.pendenciasRaw);
    if (impState.pendenciasCache.resumo) atualizarKpisCards(impState.pendenciasCache.resumo);
    atualizarTextoEmailApp();
  }

  if (showFeedback) {
    showToast('⚡ Alteração salva automaticamente!', 'success');
  }
}

document.getElementById('btn-save-cell-detail')?.addEventListener('click', () => {
  commitAndSaveCellDetail(true, true);
});

// ==========================================================================
// 7.1 INTEGRAÇÃO DIRETA COM MOTOR NGPONTO (GRAVAÇÃO SQL & FOLHA MANUAL)
// ==========================================================================

/**
 * Gravação direta de acerto de ponto no banco SQL do NGPonto (pto_movimentomarcacao)
 * Recurso integrado ao modal de detalhes do dia (atualmente bloqueado no UI conforme instrução).
 */
async function salvarAcertoNoNGPonto() {
  const { colabId, isoDate } = currentEditingCell;
  if (!colabId || !isoDate) return;

  const colab = appState.colaboradores.find(c => c.id === colabId);
  if (!colab) {
    showToast('Colaborador não identificado.', 'error');
    return;
  }

  // Identifica idowner e idregistro no NGPonto
  const idowner = colab.idowner || (colab.filialId === '6716' ? 6716 : 7452);
  const idregistro = colab.idregistro || colab.registroId || colab.cracha;

  if (!idregistro) {
    showToast('Crachá/Registro do colaborador não localizado para envio ao NGPonto.', 'error');
    return;
  }

  const em = (document.getElementById('punch-em')?.value || '').trim();
  const sm = (document.getElementById('punch-sm')?.value || '').trim();
  const et = (document.getElementById('punch-et')?.value || '').trim();
  const st = (document.getElementById('punch-st')?.value || '').trim();

  const batidas = [em, sm, et, st].filter(b => b && b.includes(':'));
  const motivo = (document.getElementById('input-cell-justificativa')?.value || '').trim() || 'Acerto via AppLucas';
  const shouldReplicate = document.getElementById('check-replicate-days')?.checked || false;
  const replicateCount = shouldReplicate ? (parseInt(document.getElementById('input-replicate-count')?.value, 10) || 1) : 1;

  const btn = document.getElementById('btn-save-and-inject-ng');
  if (btn) btn.disabled = true;

  try {
    showToast('Enviando acerto para gravação direta no NGPonto...', 'info');
    const res = await fetch(`${API_BASE}/api/salvar-acerto-dia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idowner: Number(idowner),
        idregistro: Number(idregistro),
        data: isoDate,
        batidas,
        idocorrencia: 0,
        motivo,
        replicarDias: replicateCount
      })
    }).then(r => r.json());

    if (res && res.ok) {
      showToast('✅ ' + (res.mensagem || 'Acerto gravado diretamente no SQL do NGPonto!'), 'success');
      // Salva também as alterações na memória e no storage do AppLucas
      document.getElementById('btn-save-cell-detail')?.click();
    } else {
      showToast('Erro ao gravar no NGPonto: ' + (res?.erro || 'Falha na resposta do servidor'), 'error');
    }
  } catch (err) {
    console.error('Erro ao conectar ao motor NGPonto:', err);
    showToast(formatMotorErrorMessage(err, 'Falha na comunicação com o Motor NGPonto'), 'error');
  } finally {
    // Mantém o estado desabilitado caso a trava continue ativa
    const lockActive = true;
    if (btn && lockActive) btn.disabled = true;
  }
}

document.getElementById('btn-save-and-inject-ng')?.addEventListener('click', (e) => {
  e.preventDefault();
  showToast('A gravação direta no NGPonto foi desativada para manter o Dashboard e o NGPonto independentes.', 'info');
});

/**
 * Lançador de Folhas de Ponto Manuais em Lote no NGPonto (Motor Ponto SQL)
 * Usado para registrar folhas físicas de motoristas e colaboradores sem relógio biométrico.
 * 
 * @param {Object} options
 * @param {number|string} options.idowner - ID da empresa (ex: 7452 ou 6716)
 * @param {number|string} options.idregistro - ID de registro do funcionário no NG (ou cracha)
 * @param {string} [options.cpf] - CPF do colaborador
 * @param {number} options.mes - Mês (1 a 12)
 * @param {number} options.ano - Ano (ex: 2026)
 * @param {Array<{dia: number, batidas: string[]}>} options.dias - Lista de dias e horários (ex: [{ dia: 1, batidas: ['07:30', '12:00', '13:00', '17:30'] }])
 * @param {boolean} [options.limparAntes=true] - Se limpa marcações manuais anteriores antes de gravar
 * @param {boolean} [options.importarMovimento=true] - Se roda importação de movimento logo após gravação
 */
async function lancarFolhaManualNG({ idowner, idregistro, cpf = '', mes, ano, dias = [], limparAntes = true, importarMovimento = true }) {
  if (!idowner || !idregistro || !mes || !ano || !Array.isArray(dias) || dias.length === 0) {
    throw new Error('Parâmetros obrigatórios ausentes: idowner, idregistro, mes, ano e dias.');
  }

  console.log(`[lancarFolhaManualNG] Enviando folha manual para Colab ID ${idregistro} (${mes}/${ano}) com ${dias.length} dias...`);
  
  const payload = {
    idowner: Number(idowner),
    idregistro: Number(idregistro),
    cpf: String(cpf || ''),
    mes: Number(mes),
    ano: Number(ano),
    limparAntes: Boolean(limparAntes),
    importarMovimento: Boolean(importarMovimento),
    dias
  };

  const res = await fetch(`${API_BASE}/api/lancar-manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.json());

  if (!res.ok) {
    throw new Error(res.erro || 'Falha ao lançar folha manual no NGPonto');
  }

  console.log('[lancarFolhaManualNG] Sucesso:', res);
  return res;
}

if (typeof window !== 'undefined') {
  window.lancarFolhaManualNG = lancarFolhaManualNG;
  window.salvarAcertoNoNGPonto = salvarAcertoNoNGPonto;
}

// ==========================================================================
// 8. MURAL DE AVISOS & COMUNICADOS (DASHBOARD PRINCIPAL)
// ==========================================================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateTimeBR(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${ano} às ${hora}:${min}`;
  } catch (e) {
    return isoString;
  }
}

// ==========================================================================
// 8. CALENDÁRIO DE PRAZOS LEGAIS & AVISOS CLT / DP
// ==========================================================================

const DIAS_SEMANA_NOMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
let currentModalDate = null;

function addCalendarDays(dateStr, days) {
  try {
    const parts = dateStr.split('-');
    const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    dt.setDate(dt.getDate() + days);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  } catch (e) {
    return dateStr;
  }
}

/**
 * Regra de folga dos avisos de PAGAMENTO (rescisão, férias, salário, FGTS...):
 * o aviso sempre aparece pelo menos 1 dia ANTES do prazo legal, garantindo 1 dia a mais
 * de prazo além do aviso. Se o dia cair em domingo/feriado, recua para o dia útil anterior.
 */
function getPaymentNoticeDate(deadlineIso, branchId) {
  if (!deadlineIso) return deadlineIso;
  let d = addCalendarDays(deadlineIso, -1);
  for (let i = 0; i < 10; i++) {
    const dow = new Date(d + 'T12:00:00').getDay();
    const isFeriado = (appState.feriados || []).some(f =>
      f.data === d && (f.escopo === 'NACIONAL' || !branchId || branchId === 'TODAS' || f.escopo === branchId)
    );
    if (dow !== 0 && !isFeriado) break;
    d = addCalendarDays(d, -1);
  }
  return d;
}

function getTodayISOLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Prorrogação Automática de Avisos Vencidos (Rollover Diário):
 * Caso um aviso com autoRollover (ex: chamar para assinar rescisão) vença sem ser marcado como feito,
 * ele automaticamente avança para o dia seguinte e assim por diante até ser concluído.
 */
function checkAndRolloverPendingNotices() {
  if (!appState.avisos || !Array.isArray(appState.avisos)) return;
  const todayStr = getTodayISOLocal();
  let modified = false;

  appState.avisos.forEach(aviso => {
    const isAssinaturaDoc = aviso.autoRollover === true ||
      aviso.isAssinaturaDoc === true ||
      (aviso.id && aviso.id.startsWith('aviso-assinatura-')) ||
      (aviso.titulo && (aviso.titulo.toLowerCase().includes('assinar documentos rescisórios') || aviso.titulo.toLowerCase().includes('documentos rescisórios')));

    if (isAssinaturaDoc && !aviso.concluido) {
      if (aviso.data < todayStr) {
        if (!aviso.dataOriginalAgendada) {
          aviso.dataOriginalAgendada = aviso.data;
        }
        aviso.dataAnterior = aviso.data;
        aviso.data = todayStr;
        aviso.prorrogadoAutomatico = true;
        aviso.updatedAt = new Date().toISOString();
        modified = true;
      }
    }
  });

  if (modified) {
    saveStateToStorage();
  }
}

/**
 * Garante que colaboradores demitidos tenham os 2 avisos no mural:
 * 1. Prazo final de pagamento (10 dias corridos CLT Art. 477)
 * 2. Chamar para assinar documentos rescisórios (1 dia após o pagamento, com prorrogação diária)
 */
function syncDismissalNotices() {
  if (!appState.colaboradores || !Array.isArray(appState.colaboradores)) return;
  if (!appState.avisos) appState.avisos = [];
  let modified = false;

  appState.colaboradores.forEach(colab => {
    if (colab.status === 'demitido' && colab.dataDemissao) {
      const colabKeyId = colab.id || generateColaboradorId(colab.filialId, colab.cracha);
      const prazoFatal = addCalendarDays(colab.dataDemissao, 10);
      const dataAssinatura = addCalendarDays(prazoFatal, 1);
      // Aviso de pagamento sempre 1 dia antes do prazo fatal (1 dia de folga além do aviso)
      const avisoPagtoData = getPaymentNoticeDate(prazoFatal, colab.filialId);
      const avisoPagamentoId = 'aviso-rescisao-' + colabKeyId;
      const avisoAssinaturaId = 'aviso-assinatura-' + colabKeyId;

      // 1. Prazo final de pagamento (10 dias CLT Art. 477)
      const hasPaymentNotice = appState.avisos.some(a => a.id === avisoPagamentoId || (a.colabId === colabKeyId && a.tipo === 'rescisao' && !a.isAssinaturaDoc && !a.autoRollover && !String(a.id || '').startsWith('aviso-assinatura-') && !a.feriasId));
      if (!hasPaymentNotice) {
        appState.avisos.unshift({
          id: avisoPagamentoId,
          data: avisoPagtoData,
          prazoLegal: prazoFatal,
          tipo: 'rescisao',
          titulo: `🔴 Prazo Limite Rescisão - ${colab.nome} (10 dias CLT Art. 477)`,
          descricao: `Prazo legal fatal de 10 dias corridos para homologação e pagamento de verbas rescisórias (Art. 477, § 6º da CLT). Data da demissão: ${formatDateBR(colab.dataDemissao)}. Prazo fatal: ${formatDateBR(prazoFatal)}. Aviso antecipado para ${formatDateBR(avisoPagtoData)} (1 dia de folga além do aviso).`,
          filialId: colab.filialId,
          colabId: colabKeyId,
          concluido: false,
          concluidoEm: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        modified = true;
      } else {
        // Migração: avisos automáticos antigos ficavam no próprio dia do prazo fatal → antecipa 1 dia
        const existingPagto = appState.avisos.find(a => a.id === avisoPagamentoId);
        if (existingPagto && !existingPagto.concluido && existingPagto.data === prazoFatal && avisoPagtoData !== prazoFatal) {
          existingPagto.data = avisoPagtoData;
          existingPagto.prazoLegal = prazoFatal;
          existingPagto.updatedAt = new Date().toISOString();
          modified = true;
        }
      }

      // 2. Chamar para assinar documentos rescisórios (1 dia após o pagamento, com prorrogação diária)
      const hasSigningNotice = appState.avisos.some(a => a.id === avisoAssinaturaId || (a.colabId === colabKeyId && (a.isAssinaturaDoc || a.autoRollover)));
      if (!hasSigningNotice) {
        appState.avisos.unshift({
          id: avisoAssinaturaId,
          data: dataAssinatura,
          dataOriginalAgendada: dataAssinatura,
          tipo: 'rescisao',
          isAssinaturaDoc: true,
          autoRollover: true,
          titulo: `📝 Chamar para Assinar Documentos Rescisórios - ${colab.nome}`,
          descricao: `Chamar o colaborador ${colab.nome} para conferência e assinatura dos documentos rescisórios (TRCT, guias do FGTS e Seguro-Desemprego). Prazo de pagamento: ${formatDateBR(prazoFatal)}. Data original: ${formatDateBR(dataAssinatura)}. (Caso não seja concluído ao final do dia, este aviso é prorrogado automaticamente para o dia seguinte).`,
          filialId: colab.filialId,
          colabId: colabKeyId,
          concluido: false,
          concluidoEm: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        modified = true;
      }
    }
  });

  if (modified) {
    saveStateToStorage();
  }
}

function get5thBusinessDay(year, month) {
  let businessDaysCount = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    const dayOfWeek = dt.getDay(); // 0 = Domingo
    if (dayOfWeek !== 0) { // Segunda a Sábado contam como dias úteis na CLT
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isFeriado = (appState.feriados || []).some(f => f.data === iso);
      if (!isFeriado) {
        businessDaysCount++;
        if (businessDaysCount === 5) {
          return iso;
        }
      }
    }
  }
  return `${year}-${String(month + 1).padStart(2, '0')}-07`;
}

function getLastBusinessDay(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = daysInMonth; d >= 1; d--) {
    const dt = new Date(year, month, d);
    const dayOfWeek = dt.getDay(); // 0 = Domingo
    // SÁBADO É DIA ÚTIL! Apenas Domingo (0) não é dia útil, além de feriados cadastrados
    if (dayOfWeek !== 0) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isFeriado = (appState.feriados || []).some(f => f.data === iso && (f.escopo === 'NACIONAL' || f.escopo === appState.activeBranchId));
      if (!isFeriado) {
        return iso;
      }
    }
  }
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
}

function renderAvisosView() {
  checkAndRolloverPendingNotices();
  syncDismissalNotices();

  if (typeof appState.calendarYear !== 'number') appState.calendarYear = appState.currentYear || 2026;
  if (typeof appState.calendarMonth !== 'number') appState.calendarMonth = (typeof appState.currentMonth === 'number') ? appState.currentMonth : 9;

  const calYear = appState.calendarYear;
  const calMonth = appState.calendarMonth;

  // Atualiza título do mês exibido: ex: "outubro de 2026" (minúsculo como na referência "marzo de 2025")
  const monthDisplay = document.getElementById('cal-month-display');
  if (monthDisplay) {
    monthDisplay.textContent = `${MESES_PT[calMonth].toLowerCase()} de ${calYear}`;
  }

  // Indicador da filial ativa no topo do calendário
  const currentBranch = appState.filiais.find(f => f.id === appState.activeBranchId);
  const branchName = currentBranch ? currentBranch.nome : 'Todas as Filiais';
  const branchIndicator = document.getElementById('avisos-branch-indicator') || document.getElementById('cal-branch-indicator');
  if (branchIndicator) {
    branchIndicator.innerHTML = `📍 Filial Ativa: <strong>${escapeHtml(branchName)}</strong> • Prazos de Rescisão (10 dias), Salário, Ponto e Férias`;
  }

  // Estatísticas e KPIs do Mês
  const allAvisos = appState.avisos || [];
  const monthPrefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;

  const monthNotices = allAvisos.filter(a => {
    if (!a.data || !a.data.startsWith(monthPrefix)) return false;
    if (a.filialId && a.filialId !== 'TODAS' && a.filialId !== appState.activeBranchId) return false;
    return true;
  });

  const pendentes = monthNotices.filter(a => !a.concluido);
  const concluidos = monthNotices.filter(a => !!a.concluido);
  const rescisoes = monthNotices.filter(a => a.tipo === 'rescisao');

  const kpiPendentes = document.getElementById('kpi-cal-pendentes');
  const kpiConcluidos = document.getElementById('kpi-cal-concluidos');
  const kpiRescisoes = document.getElementById('kpi-cal-rescisoes');
  const kpiTotal = document.getElementById('kpi-cal-total');

  if (kpiPendentes) kpiPendentes.textContent = pendentes.length;
  if (kpiConcluidos) kpiConcluidos.textContent = concluidos.length;
  if (kpiRescisoes) kpiRescisoes.textContent = rescisoes.length;
  if (kpiTotal) kpiTotal.textContent = monthNotices.length;

  // Filtros ativos
  const filterTipo = document.getElementById('cal-filter-tipo')?.value || 'todos';
  const filterStatus = document.getElementById('cal-filter-status')?.value || 'todos';

  // Controle de alternância de vistas (Mês | Semana | Dia | Agenda)
  const currentView = appState.calViewMode || 'mes';
  document.querySelectorAll('.cal-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.calView === currentView);
  });

  const mesContainer = document.getElementById('cal-view-container-mes');
  const semanaContainer = document.getElementById('cal-view-container-semana');
  const diaContainer = document.getElementById('cal-view-container-dia');
  const agendaContainer = document.getElementById('cal-view-container-agenda');

  if (mesContainer) mesContainer.style.display = currentView === 'mes' ? 'block' : 'none';
  if (semanaContainer) semanaContainer.style.display = currentView === 'semana' ? 'block' : 'none';
  if (diaContainer) diaContainer.style.display = currentView === 'dia' ? 'block' : 'none';
  if (agendaContainer) agendaContainer.style.display = currentView === 'agenda' ? 'block' : 'none';

  const todayIso = new Date().toISOString().split('T')[0];

  if (currentView === 'agenda') {
    renderAgendaView(monthNotices);
    return;
  } else if (currentView === 'semana') {
    renderSemanaView(calYear, calMonth, filterTipo, filterStatus, todayIso);
    return;
  } else if (currentView === 'dia') {
    renderDiaView(calYear, calMonth, filterTipo, filterStatus, todayIso);
    return;
  }

  // Renderização da Grade do Calendário (Visão Mês - 7 Colunas: SEG a DOM)
  const grid = document.getElementById('cal-days-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const firstDay = new Date(calYear, calMonth, 1);
  // Alinhamento iniciando na Segunda-feira (0 = Seg, 1 = Ter, ..., 6 = Dom)
  const startingDayOfWeek = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevMonthDays = new Date(calYear, calMonth, 0).getDate();

  // 1. Dias do mês anterior
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const prevDayNum = prevMonthDays - i;
    const prevMonthIdx = calMonth === 0 ? 11 : calMonth - 1;
    const prevYearNum = calMonth === 0 ? calYear - 1 : calYear;
    const dateStr = `${prevYearNum}-${String(prevMonthIdx + 1).padStart(2, '0')}-${String(prevDayNum).padStart(2, '0')}`;
    grid.appendChild(createDayCellElement({
      dateStr,
      dayNum: prevDayNum,
      isOtherMonth: true,
      filterTipo,
      filterStatus,
      todayIso
    }));
  }

  // 2. Dias do mês atual
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    grid.appendChild(createDayCellElement({
      dateStr,
      dayNum: d,
      isOtherMonth: false,
      filterTipo,
      filterStatus,
      todayIso
    }));
  }

  // 3. Dias do próximo mês
  const totalRendered = startingDayOfWeek + daysInMonth;
  const remainingCells = (totalRendered % 7 === 0) ? 0 : 7 - (totalRendered % 7);
  for (let d = 1; d <= remainingCells; d++) {
    const nextMonthIdx = calMonth === 11 ? 0 : calMonth + 1;
    const nextYearNum = calMonth === 11 ? calYear + 1 : calYear;
    const dateStr = `${nextYearNum}-${String(nextMonthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    grid.appendChild(createDayCellElement({
      dateStr,
      dayNum: d,
      isOtherMonth: true,
      filterTipo,
      filterStatus,
      todayIso
    }));
  }
}

function createDayCellElement({ dateStr, dayNum, isOtherMonth, filterTipo, filterStatus, todayIso }) {
  const cell = document.createElement('div');
  const isToday = dateStr === todayIso;
  const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Filtra avisos deste dia
  const dayNotices = (appState.avisos || []).filter(a => {
    if (a.data !== dateStr) return false;
    if (a.filialId && a.filialId !== 'TODAS' && a.filialId !== appState.activeBranchId) return false;
    if (filterTipo !== 'todos' && a.tipo !== filterTipo) return false;
    if (filterStatus === 'pendente' && a.concluido) return false;
    if (filterStatus === 'concluido' && !a.concluido) return false;
    return true;
  });

  const hasUrgentPending = dayNotices.some(a => a.tipo === 'rescisao' && !a.concluido);

  cell.className = 'cal-day-cell' +
    (isOtherMonth ? ' other-month' : '') +
    (isToday ? ' today' : '') +
    (isWeekend ? ' weekend-day' : '') +
    (hasUrgentPending ? ' has-deadline-urgent' : '');
  cell.dataset.date = dateStr;

  // Cabeçalho do dia
  const visiblePills = dayNotices.slice(0, 1);
  const remainingCount = dayNotices.length - 1;

  // Cabeçalho do dia
  const topDiv = document.createElement('div');
  topDiv.className = 'cal-day-top';
  topDiv.innerHTML = `
    <div style="display:flex; align-items:center; gap:5px;">
      <span class="cal-day-number">${dayNum}</span>
      ${remainingCount > 0 ? `<span class="cal-notice-more-badge" title="${dayNotices.length} avisos neste dia">+${remainingCount} mais</span>` : ''}
    </div>
    <button class="cal-day-add-btn" title="Adicionar novo prazo neste dia">+</button>
  `;
  cell.appendChild(topDiv);

  // Lista de badges / faixas de aviso (aumentadas em 30%)
  const noticesContainer = document.createElement('div');
  noticesContainer.className = 'cal-cell-notices';

  visiblePills.forEach(aviso => {
    const isAssinatura = aviso.isAssinaturaDoc || aviso.autoRollover || (aviso.titulo && aviso.titulo.toLowerCase().includes('assinar documentos rescisórios'));
    const pill = document.createElement('div');
    pill.className = `cal-notice-pill ${isAssinatura ? 'notice-pill-assinatura' : ('notice-pill-' + (aviso.tipo || 'outros'))} ${aviso.concluido ? 'is-done' : ''}`;

    let icon = '📌';
    if (isAssinatura) icon = '📝';
    else if (aviso.tipo === 'rescisao') icon = '🔴';
    else if (aviso.tipo === 'salario') icon = '🟡';
    else if (aviso.tipo === 'ferias') icon = '🟣';
    else if (aviso.tipo === 'ponto') icon = '🔵';
    else if (aviso.tipo === 'fgts') icon = '🟢';

    const checkIcon = aviso.concluido ? '✅ ' : `${icon} `;
    pill.innerHTML = `<span>${checkIcon}</span><span style="overflow:hidden; text-overflow:ellipsis;">${escapeHtml(aviso.titulo)}</span>`;
    
    let tooltipStatus = aviso.concluido ? 'Concluído/Feito' : 'Pendente';
    if (aviso.prorrogadoAutomatico && !aviso.concluido) {
      tooltipStatus = `Prorrogado Diariamente (Data original: ${formatDateBR(aviso.dataOriginalAgendada)})`;
    }
    pill.title = `${aviso.titulo} (${tooltipStatus})`;
    noticesContainer.appendChild(pill);
  });

  cell.appendChild(noticesContainer);

  // Handler do botão "+"
  topDiv.querySelector('.cal-day-add-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openAvisoModal(null, dateStr);
  });

  // Handler do clique na célula: abre tela com os avisos do dia e botão feito
  cell.addEventListener('click', () => {
    openDayNoticesModal(dateStr);
  });

  return cell;
}

// --------------------------------------------------------------------------
// VISTA AGENDA (Lista Cronológica Mensal de Prazos)
// --------------------------------------------------------------------------
function renderAgendaView(monthNotices) {
  const container = document.getElementById('cal-agenda-list');
  if (!container) return;
  container.innerHTML = '';

  const branchMap = Object.fromEntries(appState.filiais.map(f => [f.id, f.nome]));
  const colabMap = Object.fromEntries(appState.colaboradores.map(c => [c.id, c.nome]));

  const sortedNotices = [...monthNotices].sort((a, b) => a.data.localeCompare(b.data));

  if (sortedNotices.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px 20px;">
        <div class="empty-state-icon">📅</div>
        <p>Nenhum prazo ou aviso agendado para este mês.</p>
      </div>
    `;
    return;
  }

  sortedNotices.forEach(aviso => {
    const item = document.createElement('div');
    item.className = `cal-agenda-item ${aviso.concluido ? 'is-done' : ''}`;

    const dParts = aviso.data.split('-');
    const dt = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10), 12);
    const dayNum = dParts[2];
    const dayWeek = DIAS_SEMANA_NOMES[dt.getDay()] ? DIAS_SEMANA_NOMES[dt.getDay()].slice(0, 3) : '';

    const isAssinatura = aviso.isAssinaturaDoc || aviso.autoRollover || (aviso.titulo && aviso.titulo.toLowerCase().includes('assinar documentos rescisórios'));

    let tipoBadge = '⚪ Outros';
    if (isAssinatura) tipoBadge = '📝 Assinatura Rescisão';
    else if (aviso.tipo === 'rescisao') tipoBadge = '🔴 Rescisão CLT';
    else if (aviso.tipo === 'salario') tipoBadge = '🟡 Salário/Vale';
    else if (aviso.tipo === 'ferias') tipoBadge = '🟣 Férias';
    else if (aviso.tipo === 'ponto') tipoBadge = '🔵 Ponto & VA';
    else if (aviso.tipo === 'fgts') tipoBadge = '🟢 FGTS Digital';

    const colabNome = aviso.colabId ? (colabMap[aviso.colabId] || '') : '';
    const filialNome = (!aviso.filialId || aviso.filialId === 'TODAS') ? 'Todas as Filiais' : (branchMap[aviso.filialId] || '');

    item.innerHTML = `
      <div style="display:flex; align-items:center; gap:16px;">
        <div class="cal-agenda-date-box">
          <div class="day-num">${dayNum}</div>
          <div class="day-week">${dayWeek}</div>
        </div>
        <div>
          <div style="display:flex; gap:6px; margin-bottom:4px; align-items:center; flex-wrap:wrap;">
            <span class="badge-aviso-cat badge-cat-informativo" style="font-size:10px; padding:2px 6px;">${tipoBadge}</span>
            <span class="badge-aviso-scope" style="font-size:10px; padding:2px 6px;">${escapeHtml(filialNome)}</span>
            ${isAssinatura ? `<span class="badge-rollover-daily">${aviso.prorrogadoAutomatico && !aviso.concluido ? '⏳ Prorrogado Diariamente' : '🔄 Prorroga Diariamente'}</span>` : ''}
            ${aviso.concluido ? '<span class="status-badge-done">✅ Feito</span>' : '<span class="status-badge-pending">🔴 Pendente</span>'}
          </div>
          <div style="font-size:14px; font-weight:700; color:var(--color-text-main); margin-bottom:2px;">
            ${escapeHtml(aviso.titulo)}
          </div>
          ${colabNome ? `<div style="font-size:12px; color:var(--color-cyan);">👤 ${escapeHtml(colabNome)}</div>` : ''}
          ${aviso.prorrogadoAutomatico && !aviso.concluido ? `<div style="font-size:11px; color:#FBBF24; margin-top:2px;">⏳ Prorrogado automaticamente (Agendado originalmente para ${formatDateBR(aviso.dataOriginalAgendada)})</div>` : ''}
          ${aviso.descricao ? `<div style="font-size:12px; color:var(--color-text-muted); margin-top:2px;">${escapeHtml(aviso.descricao)}</div>` : ''}
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="btn-toggle-done ${aviso.concluido ? 'reopen' : 'mark-done'}" data-id="${aviso.id}" data-date="${aviso.data}">
          ${aviso.concluido ? '↩️ Reabrir' : '✅ Feito'}
        </button>
        <button class="btn btn-secondary btn-sm btn-agenda-open-day" data-date="${aviso.data}">
          Ver Dia ➔
        </button>
      </div>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll('.btn-toggle-done').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleAvisoDone(btn.dataset.id, btn.dataset.date);
    });
  });

  container.querySelectorAll('.btn-agenda-open-day').forEach(btn => {
    btn.addEventListener('click', () => {
      openDayNoticesModal(btn.dataset.date);
    });
  });
}

// --------------------------------------------------------------------------
// VISTA SEMANA
// --------------------------------------------------------------------------
function renderSemanaView(calYear, calMonth, filterTipo, filterStatus, todayIso) {
  const container = document.getElementById('cal-week-grid');
  if (!container) return;
  container.innerHTML = '';

  const now = new Date();
  const baseDate = (now.getFullYear() === calYear && now.getMonth() === calMonth)
    ? now
    : new Date(calYear, calMonth, 15);

  const dayOfWeek = (baseDate.getDay() + 6) % 7; // 0 = Seg, 6 = Dom
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - dayOfWeek);

  const weekGrid = document.createElement('div');
  weekGrid.className = 'cal-days-grid';
  weekGrid.style.gridTemplateColumns = 'repeat(7, 1fr)';

  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    const dateStr = cur.toISOString().split('T')[0];
    const isOtherMonth = cur.getMonth() !== calMonth;
    weekGrid.appendChild(createDayCellElement({
      dateStr,
      dayNum: cur.getDate(),
      isOtherMonth,
      filterTipo,
      filterStatus,
      todayIso
    }));
  }
  container.appendChild(weekGrid);
}

// --------------------------------------------------------------------------
// VISTA DIA
// --------------------------------------------------------------------------
function renderDiaView(calYear, calMonth, filterTipo, filterStatus, todayIso) {
  const container = document.getElementById('cal-day-detail-panel');
  if (!container) return;
  container.innerHTML = '';

  const targetDate = (todayIso.startsWith(`${calYear}-${String(calMonth + 1).padStart(2, '0')}`))
    ? todayIso
    : `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`;

  const dParts = targetDate.split('-');
  const dt = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10), 12);
  const diaSemana = DIAS_SEMANA_NOMES[dt.getDay()];

  const wrapper = document.createElement('div');
  wrapper.style.padding = '24px';
  wrapper.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--color-border); padding-bottom:14px;">
      <div>
        <h3 style="margin:0; font-size:20px; color:var(--color-text-main);">Visão Diária: ${formatDateBR(targetDate)} (${diaSemana})</h3>
        <p style="margin:4px 0 0; color:var(--color-text-muted); font-size:13px;">Detalhes e ações diretas para este dia</p>
      </div>
      <button class="btn btn-primary" id="btn-dia-view-open-modal">
        <span>📅</span> Abrir Detalhes do Dia
      </button>
    </div>
    <div id="day-view-inner-content"></div>
  `;
  container.appendChild(wrapper);

  wrapper.querySelector('#btn-dia-view-open-modal')?.addEventListener('click', () => {
    openDayNoticesModal(targetDate);
  });

  const dayNotices = (appState.avisos || []).filter(a => a.data === targetDate && (!a.filialId || a.filialId === 'TODAS' || a.filialId === appState.activeBranchId));
  const inner = wrapper.querySelector('#day-view-inner-content');
  if (dayNotices.length === 0) {
    inner.innerHTML = `
      <div class="empty-state" style="padding:40px;">
        <div class="empty-state-icon">☀️</div>
        <p>Nenhum prazo ou pendência agendada para este dia específico.</p>
        <button class="btn btn-secondary btn-sm" style="margin-top:12px;" onclick="openAvisoModal(null, '${targetDate}')">+ Agendar Prazo Neste Dia</button>
      </div>
    `;
  } else {
    inner.innerHTML = `<div style="display:flex; flex-direction:column; gap:10px;">` + dayNotices.map(a => `
      <div class="cal-agenda-item ${a.concluido ? 'is-done' : ''}">
        <div>
          <div style="font-weight:700; color:var(--color-text-main); font-size:15px;">${escapeHtml(a.titulo)}</div>
          <div style="color:var(--color-text-muted); font-size:12px; margin-top:4px;">${escapeHtml(a.descricao || '')}</div>
        </div>
        <button class="btn-toggle-done ${a.concluido ? 'reopen' : 'mark-done'}" onclick="toggleAvisoDone('${a.id}', '${targetDate}')">
          ${a.concluido ? '↩️ Reabrir' : '✅ Feito'}
        </button>
      </div>
    `).join('') + `</div>`;
  }
}

function openDayNoticesModal(dateStr) {
  currentModalDate = dateStr;
  const branchMap = Object.fromEntries(appState.filiais.map(f => [f.id, f.nome]));
  const colabMap = Object.fromEntries(appState.colaboradores.map(c => [c.id, c.nome]));

  const d = new Date(dateStr + 'T12:00:00');
  const diaSemana = DIAS_SEMANA_NOMES[d.getDay()] || '';

  const titleEl = document.getElementById('modal-day-title');
  if (titleEl) {
    titleEl.innerHTML = `<span>📅</span> Prazos e Avisos de <strong>${formatDateBR(dateStr)}</strong> (${diaSemana})`;
  }

  const dayNotices = (appState.avisos || []).filter(a => {
    if (a.data !== dateStr) return false;
    if (a.filialId && a.filialId !== 'TODAS' && a.filialId !== appState.activeBranchId) return false;
    return true;
  });

  const pendentesCount = dayNotices.filter(a => !a.concluido).length;
  const feitosCount = dayNotices.filter(a => !!a.concluido).length;

  const summaryBar = document.getElementById('modal-day-summary-bar');
  if (summaryBar) {
    summaryBar.innerHTML = `
      <div><strong>${dayNotices.length}</strong> prazo(s) agendado(s) neste dia</div>
      <div>
        <span style="color:#F87171; font-weight:700;">🔴 ${pendentesCount} Pendente(s)</span>
        &nbsp;•&nbsp;
        <span style="color:#34D399; font-weight:700;">✅ ${feitosCount} Concluído(s) [Feito]</span>
      </div>
    `;
  }

  const listContainer = document.getElementById('modal-day-list-container');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  if (dayNotices.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
        <p>Nenhum aviso ou prazo cadastrado para este dia.</p>
        <p style="font-size:12px; color:var(--color-text-sub);">Clique no botão abaixo para adicionar um novo aviso neste dia.</p>
      </div>
    `;
  } else {
    dayNotices.forEach(aviso => {
      const card = document.createElement('div');
      card.className = `day-notice-card type-${aviso.tipo || 'outros'} ${aviso.concluido ? 'is-done' : ''}`;

      const scopeName = (!aviso.filialId || aviso.filialId === 'TODAS')
        ? '🌐 Todas as Filiais'
        : '🏢 ' + (branchMap[aviso.filialId] || 'Filial Específica');

      const isAssinaturaNotice = aviso.isAssinaturaDoc || aviso.autoRollover || (aviso.titulo && aviso.titulo.toLowerCase().includes('assinar documentos rescisórios'));

      let tipoLabel = '⚪ Outros';
      if (isAssinaturaNotice) tipoLabel = '📝 Assinatura de Documentos Rescisórios';
      else if (aviso.tipo === 'rescisao') tipoLabel = '🔴 Rescisão Contratual (10 dias)';
      else if (aviso.tipo === 'salario') tipoLabel = '🟡 Pagamento Salarial / Vale';
      else if (aviso.tipo === 'ferias') tipoLabel = '🟣 Férias CLT';
      else if (aviso.tipo === 'ponto') tipoLabel = '🔵 Ponto Eletrônico & VA';
      else if (aviso.tipo === 'fgts') tipoLabel = '🟢 FGTS Digital / eSocial';

      const statusBadge = aviso.concluido
        ? '<span class="status-badge-done">✅ Feito (Concluído)</span>'
        : '<span class="status-badge-pending">🔴 Pendente</span>';

      const rolloverBadge = isAssinaturaNotice
        ? `<span class="badge-rollover-daily" title="Caso não seja feito ao final do dia, este aviso avança automaticamente para o dia seguinte até ser marcado como feito">${aviso.prorrogadoAutomatico && !aviso.concluido ? '⏳ Prorrogado Diariamente' : '🔄 Prorroga Diariamente'}</span>`
        : '';

      const colabName = aviso.colabId ? (colabMap[aviso.colabId] || 'Colaborador vinculado') : null;

      card.innerHTML = `
        <div class="day-notice-header">
          <div class="day-notice-badges" style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
            <span class="badge-aviso-cat badge-cat-informativo" style="font-size:10px; padding:2px 6px;">${tipoLabel}</span>
            <span class="badge-aviso-scope" style="font-size:10px; padding:2px 6px;">${scopeName}</span>
            ${rolloverBadge}
            ${statusBadge}
          </div>
          <div style="font-size:11px; color:var(--color-text-muted);">
            ${aviso.concluidoEm ? 'Feito em: ' + formatDateTimeBR(aviso.concluidoEm) : 'Criado em: ' + formatDateTimeBR(aviso.createdAt)}
          </div>
        </div>

        <h4 class="day-notice-title">${escapeHtml(aviso.titulo)}</h4>

        ${colabName ? `<div style="font-size:12px; color:var(--color-cyan); font-weight:600;">👤 Colaborador: ${escapeHtml(colabName)}</div>` : ''}

        ${aviso.prorrogadoAutomatico && !aviso.concluido ? `
          <div style="background:rgba(245, 158, 11, 0.12); border:1px solid rgba(245, 158, 11, 0.3); border-radius:6px; padding:8px 10px; margin:8px 0; font-size:12px; color:#FCD34D;">
            ⏳ <strong>Prorrogação Diária Automática:</strong> Este aviso venceu sem ser concluído (data original agendada: <strong>${formatDateBR(aviso.dataOriginalAgendada)}</strong>) e foi transferido automaticamente para hoje. Ele continuará avançando a cada novo dia até que seja marcado como <strong>FEITO</strong>.
          </div>
        ` : ''}

        ${aviso.descricao ? `<div class="day-notice-desc">${escapeHtml(aviso.descricao)}</div>` : ''}

        <div class="day-notice-actions">
          <div>
            ${aviso.concluido
          ? `<button class="btn-toggle-done reopen" data-id="${aviso.id}">↩️ Reabrir (Marcar como Pendente)</button>`
          : `<button class="btn-toggle-done mark-done" data-id="${aviso.id}">✅ Marcar como FEITO</button>`
        }
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm btn-edit-day-notice" data-id="${aviso.id}">✏️ Editar</button>
            <button class="btn btn-danger btn-sm btn-delete-day-notice" data-id="${aviso.id}">🗑️</button>
          </div>
        </div>
      `;

      listContainer.appendChild(card);
    });

    listContainer.querySelectorAll('.btn-toggle-done').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleAvisoDone(btn.dataset.id, dateStr);
      });
    });

    listContainer.querySelectorAll('.btn-edit-day-notice').forEach(btn => {
      btn.addEventListener('click', () => {
        closeModal('modal-day-avisos');
        openAvisoModal(btn.dataset.id);
      });
    });

    listContainer.querySelectorAll('.btn-delete-day-notice').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteAviso(btn.dataset.id, dateStr);
      });
    });
  }

  const btnAddNew = document.getElementById('btn-day-add-new-notice');
  if (btnAddNew) {
    btnAddNew.onclick = () => {
      closeModal('modal-day-avisos');
      openAvisoModal(null, dateStr);
    };
  }

  openModal('modal-day-avisos');
}

function toggleAvisoDone(avisoId, dateStr) {
  const aviso = (appState.avisos || []).find(a => a.id === avisoId);
  if (!aviso) return;
  aviso.concluido = !aviso.concluido;
  aviso.concluidoEm = aviso.concluido ? new Date().toISOString() : null;
  saveStateToStorage();
  renderAvisosView();
  if (dateStr) {
    openDayNoticesModal(dateStr);
  }
  showToast(aviso.concluido ? 'Prazo marcado como CONCLUÍDO (Feito)!' : 'Prazo reaberto como PENDENTE.', 'success');
}

function openAvisoModal(avisoId = null, defaultDate = null) {
  const idInput = document.getElementById('aviso-edit-id');
  const dataInput = document.getElementById('aviso-data');
  const tipoInput = document.getElementById('aviso-tipo');
  const tituloInput = document.getElementById('aviso-titulo');
  const colabSelect = document.getElementById('aviso-colab');
  const filialSelect = document.getElementById('aviso-filial');
  const deptSelect = document.getElementById('aviso-filter-dept');
  const descInput = document.getElementById('aviso-descricao');
  const concluidoCheck = document.getElementById('aviso-concluido');
  const titleHeader = document.getElementById('modal-aviso-title');
  const presetSelect = document.getElementById('select-preset-legal');
  const boxRescisao = document.getElementById('box-helper-rescisao');
  const inputDemissao = document.getElementById('input-calc-demissao-data');

  if (!filialSelect) return;

  filialSelect.innerHTML = '<option value="TODAS">🌐 Todas as Filiais</option>' +
    appState.filiais.map(f => `<option value="${f.id}">🏢 ${f.nome}</option>`).join('');

  if (deptSelect) {
    deptSelect.innerHTML = '<option value="todos">Todos os Departamentos</option>' +
      appState.departamentos.map(d => `<option value="${d.id}">${d.nome}</option>`).join('');
    deptSelect.value = 'todos';
  }

  function updateAvisoColabOptions(selectedId = '') {
    if (!colabSelect) return;
    const curFilial = filialSelect.value;
    const curDept = deptSelect ? deptSelect.value : 'todos';

    let list = [...appState.colaboradores];
    if (curFilial && curFilial !== 'TODAS') {
      list = list.filter(c => c.filialId === curFilial);
    }
    if (curDept && curDept !== 'todos') {
      list = list.filter(c => c.deptId === curDept);
    }

    list.sort((a, b) => Number(a.cracha) - Number(b.cracha));

    colabSelect.innerHTML = '<option value="">Nenhum / Prazo Geral</option>' +
      list.map(c => `<option value="${c.id}">${c.cracha} - ${escapeHtml(c.nome)}</option>`).join('');

    if (selectedId) {
      colabSelect.value = selectedId;
    }
  }

  filialSelect.onchange = () => updateAvisoColabOptions(colabSelect?.value);
  if (deptSelect) {
    deptSelect.onchange = () => updateAvisoColabOptions(colabSelect?.value);
  }

  if (boxRescisao) boxRescisao.style.display = 'none';
  if (presetSelect) presetSelect.value = 'custom';

  if (avisoId) {
    const aviso = (appState.avisos || []).find(a => a.id === avisoId);
    if (!aviso) return;
    idInput.value = aviso.id;
    dataInput.value = aviso.data || '';
    tipoInput.value = aviso.tipo || 'rescisao';
    tituloInput.value = aviso.titulo || '';
    filialSelect.value = aviso.filialId || 'TODAS';

    if (aviso.colabId) {
      const linkedColab = appState.colaboradores.find(c => c.id === aviso.colabId);
      if (linkedColab && deptSelect) {
        deptSelect.value = linkedColab.deptId || 'todos';
      }
    }

    updateAvisoColabOptions(aviso.colabId || '');
    descInput.value = aviso.descricao || aviso.conteudo || '';
    concluidoCheck.checked = !!aviso.concluido;
    if (titleHeader) titleHeader.innerHTML = '<span>✏️</span> Editar Prazo / Aviso Legal';
  } else {
    idInput.value = '';
    const initialDate = defaultDate || new Date().toISOString().split('T')[0];
    dataInput.value = initialDate;
    tipoInput.value = 'rescisao';
    tituloInput.value = '';
    filialSelect.value = appState.activeBranchId || 'TODAS';
    if (deptSelect) deptSelect.value = 'todos';
    updateAvisoColabOptions('');
    descInput.value = '';
    concluidoCheck.checked = false;
    if (inputDemissao) inputDemissao.value = initialDate;
    if (titleHeader) titleHeader.innerHTML = '<span>📅</span> Novo Prazo / Aviso Legal';
  }

  openModal('modal-aviso');
}

function handleLegalPresetChange(preset) {
  const boxRescisao = document.getElementById('box-helper-rescisao');
  const tipoInput = document.getElementById('aviso-tipo');
  const dataInput = document.getElementById('aviso-data');
  const tituloInput = document.getElementById('aviso-titulo');
  const descInput = document.getElementById('aviso-descricao');
  const colabSelect = document.getElementById('aviso-colab');
  const colabNome = (colabSelect && colabSelect.selectedIndex > 0)
    ? colabSelect.options[colabSelect.selectedIndex].text
    : 'Colaborador';

  if (boxRescisao) {
    boxRescisao.style.display = (preset === 'rescisao' || preset === 'assinatura_rescisao') ? 'block' : 'none';
  }

  const calYear = appState.calendarYear || 2026;
  const calMonth = (typeof appState.calendarMonth === 'number') ? appState.calendarMonth : 9;

  if (preset === 'rescisao') {
    if (tipoInput) tipoInput.value = 'rescisao';
    const inputDemissao = document.getElementById('input-calc-demissao-data');
    const demissaoVal = inputDemissao?.value || new Date().toISOString().split('T')[0];
    const prazoFatal = addCalendarDays(demissaoVal, 10);
    const avisoPagto = getPaymentNoticeDate(prazoFatal, appState.activeBranchId);
    if (dataInput) dataInput.value = avisoPagto;
    if (tituloInput) tituloInput.value = `🔴 Pagamento Rescisão Contratual - ${colabNome} (10 dias CLT Art. 477)`;
    if (descInput) descInput.value = `Prazo improrrogável de 10 dias corridos para pagamento integral das verbas rescisórias e entrega das guias (TRCT/FGTS) conforme Art. 477, § 6º da CLT. Demissão em: ${formatDateBR(demissaoVal)}. Prazo fatal: ${formatDateBR(prazoFatal)} (aviso antecipado em 1 dia).`;
  } else if (preset === 'assinatura_rescisao') {
    if (tipoInput) tipoInput.value = 'rescisao';
    const inputDemissao = document.getElementById('input-calc-demissao-data');
    const demissaoVal = inputDemissao?.value || new Date().toISOString().split('T')[0];
    const prazoFatal = addCalendarDays(demissaoVal, 10);
    const dataAssinatura = addCalendarDays(prazoFatal, 1);
    if (dataInput) dataInput.value = dataAssinatura;
    if (tituloInput) tituloInput.value = `📝 Chamar para Assinar Documentos Rescisórios - ${colabNome}`;
    if (descInput) descInput.value = `Chamar o colaborador para conferência e assinatura dos documentos rescisórios (TRCT, guias do FGTS e Seguro-Desemprego). Prazo de pagamento: ${formatDateBR(prazoFatal)}. Data agendada da assinatura: ${formatDateBR(dataAssinatura)}. (Caso não seja concluído ao final do dia, este aviso avança automaticamente para o dia seguinte até ser marcado como feito).`;
  } else if (preset === 'salario_5') {
    if (tipoInput) tipoInput.value = 'salario';
    const quintoDia = get5thBusinessDay(calYear, calMonth);
    if (dataInput) dataInput.value = getPaymentNoticeDate(quintoDia, appState.activeBranchId);
    if (tituloInput) tituloInput.value = `🟡 Pagamento Salarial Mensal (5º Dia Útil - CLT Art. 459)`;
    if (descInput) descInput.value = `Até o 5º dia útil do mês subsequente ao trabalhado conforme Art. 459, § 1º da CLT.`;
  } else if (preset === 'adiantamento') {
    if (tipoInput) tipoInput.value = 'salario';
    if (dataInput) dataInput.value = getPaymentNoticeDate(`${calYear}-${String(calMonth + 1).padStart(2, '0')}-20`, appState.activeBranchId);
    if (tituloInput) tituloInput.value = `🟡 Adiantamento Salarial Quinzenal (Vale 40%)`;
    if (descInput) descInput.value = `Pagamento do vale salarial quinzenal aos colaboradores com opção cadastrada.`;
  } else if (preset === 'ferias_aviso') {
    if (tipoInput) tipoInput.value = 'ferias';
    if (tituloInput) tituloInput.value = `🟣 Aviso Prévio de Férias - ${colabNome} (30 dias antecedência CLT)`;
    if (descInput) descInput.value = `Comunicação formal por escrito com antecedência mínima de 30 dias (Art. 135 da CLT).`;
  } else if (preset === 'ferias_pagto') {
    if (tipoInput) tipoInput.value = 'ferias';
    if (tituloInput) tituloInput.value = `🟣 Pagamento de Férias + 1/3 - ${colabNome} (Até 2 dias antes - CLT Art. 145)`;
    if (descInput) descInput.value = `O pagamento da remuneração das férias e do terço constitucional deve ser efetuado até 2 dias antes do início do respectivo período (Art. 145 da CLT). Agende este aviso 3 dias antes do início das férias (1 dia de folga além do aviso).`;
  } else if (preset === 'ponto_fechamento') {
    if (tipoInput) tipoInput.value = 'ponto';
    const lastBusinessDay = getLastBusinessDay(calYear, calMonth);
    if (dataInput) dataInput.value = lastBusinessDay;
    if (tituloInput) tituloInput.value = `🔵 Fechamento de Ponto & VA (Último dia útil do mês)`;
    if (descInput) descInput.value = `Data de corte no último dia útil do mês (${formatDateBR(lastBusinessDay)}) para conferência de batidas manuais, faltas e atestados para apuração definitiva do crédito de Vale Alimentação.`;
  } else if (preset === 'fgts_digital') {
    if (tipoInput) tipoInput.value = 'fgts';
    if (dataInput) dataInput.value = getPaymentNoticeDate(`${calYear}-${String(calMonth + 1).padStart(2, '0')}-20`, appState.activeBranchId);
    if (tituloInput) tituloInput.value = `🟢 Vencimento Guia FGTS Digital (eSocial)`;
    if (descInput) descInput.value = `Recolhimento mensal do FGTS Digital via PIX/código de barras referente à folha anterior.`;
  }
}

function saveAvisoFromModal() {
  const idInput = document.getElementById('aviso-edit-id');
  const dataInput = document.getElementById('aviso-data');
  const tipoInput = document.getElementById('aviso-tipo');
  const tituloInput = document.getElementById('aviso-titulo');
  const colabSelect = document.getElementById('aviso-colab');
  const filialSelect = document.getElementById('aviso-filial');
  const descInput = document.getElementById('aviso-descricao');
  const concluidoCheck = document.getElementById('aviso-concluido');

  const dataVal = dataInput.value;
  const titulo = tituloInput.value.trim();

  if (!dataVal) {
    showToast('Por favor, informe a data do prazo no calendário.', 'warning');
    dataInput.focus();
    return;
  }
  if (!titulo) {
    showToast('Por favor, informe o título do prazo ou aviso.', 'warning');
    tituloInput.focus();
    return;
  }

  if (!appState.avisos) appState.avisos = [];

  const preset = document.getElementById('select-preset-legal')?.value;
  const isAssinatura = preset === 'assinatura_rescisao' ||
    titulo.toLowerCase().includes('assinar documentos rescisórios') ||
    (titulo.toLowerCase().includes('assinatura') && titulo.toLowerCase().includes('rescis'));

  const avisoId = idInput.value;
  if (avisoId) {
    const idx = appState.avisos.findIndex(a => a.id === avisoId);
    if (idx !== -1) {
      const isNowDone = concluidoCheck.checked;
      appState.avisos[idx] = {
        ...appState.avisos[idx],
        data: dataVal,
        tipo: tipoInput.value,
        titulo,
        filialId: filialSelect.value,
        colabId: colabSelect ? colabSelect.value : '',
        descricao: descInput.value.trim(),
        concluido: isNowDone,
        concluidoEm: isNowDone ? (appState.avisos[idx].concluidoEm || new Date().toISOString()) : null,
        autoRollover: isAssinatura ? true : (appState.avisos[idx].autoRollover || false),
        isAssinaturaDoc: isAssinatura ? true : (appState.avisos[idx].isAssinaturaDoc || false),
        dataOriginalAgendada: appState.avisos[idx].dataOriginalAgendada || dataVal,
        updatedAt: new Date().toISOString()
      };
      showToast('Prazo atualizado com sucesso!', 'success');
    }
  } else {
    const isDone = concluidoCheck.checked;
    const newAviso = {
      id: (isAssinatura && colabSelect?.value) ? ('aviso-assinatura-' + colabSelect.value) : ('aviso-' + Date.now()),
      data: dataVal,
      dataOriginalAgendada: dataVal,
      tipo: tipoInput.value,
      isAssinaturaDoc: isAssinatura,
      autoRollover: isAssinatura,
      titulo,
      filialId: filialSelect.value,
      colabId: colabSelect ? colabSelect.value : '',
      descricao: descInput.value.trim(),
      concluido: isDone,
      concluidoEm: isDone ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    appState.avisos.unshift(newAviso);
    showToast('Novo prazo agendado no calendário!', 'success');
  }

  saveStateToStorage();
  closeModal('modal-aviso');
  renderCurrentView();

  if (currentModalDate && currentModalDate === dataVal) {
    openDayNoticesModal(dataVal);
  }
}

function deleteAviso(avisoId, dateStr = null) {
  if (!confirm('Tem certeza de que deseja excluir este prazo do calendário?')) return;
  appState.avisos = (appState.avisos || []).filter(a => a.id !== avisoId);
  saveStateToStorage();
  renderCurrentView();
  if (dateStr) {
    openDayNoticesModal(dateStr);
  }
  showToast('Prazo excluído do calendário.', 'info');
}

// Os avisos do calendário e o botão "Ver no Calendário" foram removidos do Dashboard de Ponto.
// Mantida apenas como no-op para compatibilidade com chamadas antigas.
function updatePontoUrgentBanner() {
  document.getElementById('ponto-urgent-banner')?.remove();
}

/**
 * Indica se o colaborador possui algum desconto no mês (falta integral, meio período ou atraso
 * não abonado). Usado para destacar com borda vermelha o DSR zerado que ainda tem descontos.
 */
function hasDescontoNoMes(occ) {
  if (!occ) return false;
  if (occ.faltasIntegrais > 0 || occ.faltasMeioPeriodo > 0) return true;
  if (occ.pequenosAtrasosMinutos > 0) return true;
  return (occ.ocorrencias || []).some(o => String(o.tipo || '').startsWith('Atraso Maior') && o.impacto !== 'Abonado');
}

// ==========================================================================
// 9. GESTÃO DE COLABORADORES COM FILTRO ESTRITO PELA FILIAL ATIVA DO TOPO
// ==========================================================================

let colabFiltersInitialized = false;
function setupColabFiltersDropdowns() {
  const deptSelect = document.getElementById('colab-filter-dept');
  if (!deptSelect) return;

  // Departamentos
  const currentDeptVal = deptSelect.value || 'todos';
  deptSelect.innerHTML = '<option value="todos">Todos os Departamentos</option>' +
    appState.departamentos.map(d => `<option value="${d.id}">${d.nome}</option>`).join('');
  if (currentDeptVal) deptSelect.value = currentDeptVal;

  // Filiais (adicionado seletor para permitir ver Todas as Filiais ou alternar diretamente)
  const filialSelect = document.getElementById('colab-filter-filial');
  if (filialSelect) {
    const currentFilialVal = filialSelect.value || 'ativa';
    filialSelect.innerHTML = '<option value="ativa">📍 Filial Selecionada no Topo</option>' +
      '<option value="todas">🌐 Todas as Filiais (Geral)</option>' +
      appState.filiais.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
    if (currentFilialVal) filialSelect.value = currentFilialVal;
  }

  if (!colabFiltersInitialized) {
    colabFiltersInitialized = true;
    document.getElementById('colab-search-input')?.addEventListener('input', () => renderColaboradoresView());
    document.getElementById('colab-filter-filial')?.addEventListener('change', () => renderColaboradoresView());
    deptSelect.addEventListener('change', () => renderColaboradoresView());
    document.getElementById('colab-filter-status')?.addEventListener('change', () => renderColaboradoresView());
    document.getElementById('colab-filter-ponto')?.addEventListener('change', () => renderColaboradoresView());
    document.getElementById('colab-sort-order')?.addEventListener('change', () => renderColaboradoresView());
    document.getElementById('btn-colab-reset-filters')?.addEventListener('click', () => {
      const searchIn = document.getElementById('colab-search-input');
      if (searchIn) searchIn.value = '';
      const filEl = document.getElementById('colab-filter-filial');
      if (filEl) filEl.value = 'ativa';
      deptSelect.value = 'todos';
      const stEl = document.getElementById('colab-filter-status');
      if (stEl) stEl.value = 'ativo';
      const ptEl = document.getElementById('colab-filter-ponto');
      if (ptEl) ptEl.value = 'todos';
      const sortEl = document.getElementById('colab-sort-order');
      if (sortEl) sortEl.value = 'cracha';
      renderColaboradoresView();
      showToast('Filtros de colaboradores redefinidos.', 'info');
    });
  }
}

function renderColaboradoresView() {
  const tbody = document.getElementById('colaboradores-tbody');
  if (!tbody) return;

  const branchMap = Object.fromEntries(appState.filiais.map(f => [f.id, f.nome]));
  const deptMap = Object.fromEntries(appState.departamentos.map(d => [d.id, d.nome]));

  // Preenche filtros
  setupColabFiltersDropdowns();

  // 1. FILTRAGEM POR FILIAL (Se 'ativa', segue a aba do topo; se 'todas', consolida todas as 4 filiais; ou filtra por filial específica)
  const filialSelect = document.getElementById('colab-filter-filial');
  const filialFilterVal = filialSelect ? filialSelect.value : 'ativa';

  // Subtítulo indicador da filial ativa selecionada
  const subEl = document.getElementById('colab-branch-subtitle');
  if (subEl) {
    if (filialFilterVal === 'todas') {
      subEl.textContent = '🌐 Visão Geral: Todas as Filiais (Geral)';
    } else {
      const curBranch = branchMap[filialFilterVal === 'ativa' ? appState.activeBranchId : filialFilterVal] || 'Filial Selecionada';
      subEl.textContent = '📍 Filial: ' + curBranch;
    }
  }

  let list = appState.colaboradores;
  if (filialFilterVal === 'ativa') {
    list = list.filter(c => c.filialId === appState.activeBranchId);
  } else if (filialFilterVal !== 'todas') {
    list = list.filter(c => c.filialId === filialFilterVal);
  }

  // 2. Departamento
  const deptSelect = document.getElementById('colab-filter-dept');
  if (deptSelect && deptSelect.value !== 'todos') {
    list = list.filter(c => c.deptId === deptSelect.value);
  }

  // 3. Situação (Ativo / Demitido / Todos)
  const statusSelect = document.getElementById('colab-filter-status');
  if (statusSelect && statusSelect.value !== 'todos') {
    if (statusSelect.value === 'ativo') {
      list = list.filter(c => c.status !== 'demitido' && !c.dataDemissao);
    } else if (statusSelect.value === 'demitido') {
      list = list.filter(c => c.status === 'demitido' || !!c.dataDemissao);
    }
  }

  // 4. Registra Ponto
  const pontoSelect = document.getElementById('colab-filter-ponto');
  if (pontoSelect && pontoSelect.value !== 'todos') {
    if (pontoSelect.value === 'sim') {
      list = list.filter(c => c.registraPonto !== false);
    } else if (pontoSelect.value === 'nao') {
      list = list.filter(c => c.registraPonto === false);
    }
  }

  // 5. Busca textual
  const searchInput = document.getElementById('colab-search-input');
  const q = (searchInput?.value || '').trim().toLowerCase();
  if (q) {
    list = list.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      String(c.cracha).includes(q)
    );
  }

  // Ordenação: crachá (padrão) ou ordem alfabética A→Z / Z→A.
  // Se houver busca, nomes que iniciam com o texto digitado ficam no topo!
  const sortOrder = document.getElementById('colab-sort-order')?.value || 'cracha';
  const byName = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  list.sort((a, b) => {
    if (q) {
      const aStarts = a.nome.toLowerCase().startsWith(q);
      const bStarts = b.nome.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
    }
    if (sortOrder === 'az') return byName(a, b);
    if (sortOrder === 'za') return byName(b, a);
    if (q) return byName(a, b);
    return Number(a.cracha) - Number(b.cracha);
  });

  // Contador de resultados
  const countEl = document.getElementById('colab-stats-count');
  if (countEl) {
    const isTodas = filialFilterVal === 'todas';
    const totalScope = isTodas 
      ? appState.colaboradores.length 
      : (filialFilterVal === 'ativa' 
          ? appState.colaboradores.filter(c => c.filialId === appState.activeBranchId).length 
          : appState.colaboradores.filter(c => c.filialId === filialFilterVal).length);
    const scopeLabel = isTodas 
      ? 'Todas as Filiais (Geral)' 
      : (branchMap[filialFilterVal === 'ativa' ? appState.activeBranchId : filialFilterVal] || 'Filial Selecionada');
    const demitidosScope = isTodas
      ? appState.colaboradores.filter(c => c.status === 'demitido').length
      : appState.colaboradores.filter(c => (c.filialId === (filialFilterVal === 'ativa' ? appState.activeBranchId : filialFilterVal)) && c.status === 'demitido').length;
    
    countEl.innerHTML = `<span>Exibindo <strong>${list.length}</strong> de ${totalScope} colaborador(es) em <em>${scopeLabel}</em> (${demitidosScope} demitido(s) no escopo)</span><span style="color:var(--color-text-muted); font-size:11px;">* Para ver demitidos de todas as filiais juntos, selecione "Todas as Filiais"</span>`;
  }

  tbody.innerHTML = '';
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 24px; color: var(--color-text-sub);">Nenhum colaborador encontrado para os filtros selecionados.</td></tr>';
    return;
  }

  list.forEach(colab => {
    const isDemitido = colab.status === 'demitido';
    const statusBadge = isDemitido
      ? '<span class="badge-demitido">Demitido (' + (formatDateBR(colab.dataDemissao) || 'S/ Data') + ')</span>'
      : '<span class="badge-ativo">Ativo</span>';
    const pontoBadge = colab.registraPonto !== false
      ? '<span class="badge-ponto-sim">Sim</span>'
      : '<span class="badge-ponto-nao">Não</span>';
    const isAprendiz = colab.aprendiz || colab.isAprendiz;
    let extraColabBadges = '';
    if (isAprendiz) {
      const sabadoTxt = isColabFolgaSabado(colab) ? ' (Folga Sáb)' : ' (Trabalha Sáb)';
      extraColabBadges += ' <span class="badge-aprendiz" style="font-size:10px; background:rgba(245, 158, 11, 0.2); color:#FDE047; border:1px solid rgba(245, 158, 11, 0.5); padding:1px 5px; border-radius:3px;">Aprendiz' + sabadoTxt + '</span>';
    } else if (isColabFolgaSabado(colab)) {
      extraColabBadges += ' <span class="badge-sabado-folga" style="font-size:10px; background:rgba(99, 102, 241, 0.2); color:#C7D2FE; border:1px solid rgba(99, 102, 241, 0.4); padding:1px 5px; border-radius:3px;" title="Não trabalha aos sábados">Folga Sábado</span>';
    }
    if (colab.naoRecebeVa || colab.recebeVa === false) {
      extraColabBadges += ' <span class="badge-sem-va" style="font-size:10px;" title="Não recebe Vale Alimentação">Sem VA</span>';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = '<td style="font-family: var(--font-mono); font-weight:700;">' + colab.cracha + '</td><td><strong>' + escapeHtml(colab.nome) + '</strong>' + extraColabBadges + '</td><td>' + (branchMap[colab.filialId] || 'Não informada') + '</td><td>' + (deptMap[colab.deptId] || 'Geral') + '</td><td>' + formatDateBR(colab.admissao) + '</td><td class="text-center">' + pontoBadge + '</td><td class="text-center">' + statusBadge + '</td><td class="text-center"><button class="btn btn-secondary btn-sm btn-edit-colab" data-id="' + colab.id + '">✏️ Editar</button> <button class="btn btn-danger btn-sm btn-delete-colab" data-id="' + colab.id + '">🗑️ Excluir</button></td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-edit-colab').forEach(b => {
    b.addEventListener('click', () => openEmployeeModal(b.dataset.id));
  });
  tbody.querySelectorAll('.btn-delete-colab').forEach(b => {
    b.addEventListener('click', () => deleteEmployee(b.dataset.id));
  });
}


function openEmployeeModal(empId = null) {
  const branchSelect = document.getElementById('emp-branch');
  const deptSelect = document.getElementById('emp-dept');
  const checkRegistra = document.getElementById('emp-check-registra-ponto');
  const checkNaoRecebeVa = document.getElementById('emp-check-nao-recebe-va');
  const checkTrabalhaSabado = document.getElementById('emp-check-trabalha-sabado') || document.getElementById('emp-check-aprendiz-sabado');
  const checkAprendiz = document.getElementById('emp-check-aprendiz');
  const checkDemitido = document.getElementById('emp-check-demitido');
  const demissaoGroup = document.getElementById('group-emp-demissao');
  const demissaoInput = document.getElementById('emp-demissao');

  // Garante que departamentos estejam devidamente preenchidos
  appState.departamentos = normalizeDepartamentos(appState.departamentos);

  branchSelect.innerHTML = appState.filiais.map(f => '<option value="' + f.id + '">' + f.nome + '</option>').join('');
  deptSelect.innerHTML = appState.departamentos.map(d => '<option value="' + d.id + '">' + d.nome + '</option>').join('');

  const syncInfo = document.getElementById('emp-ng-sync-info');
  const badgeTxt = document.getElementById('emp-ng-status-badge');
  const detLine = document.getElementById('emp-ng-details-line');

  if (empId) {
    const emp = appState.colaboradores.find(c => c.id === empId);
    if (!emp) return;
    document.getElementById('emp-edit-id').value = emp.id;
    document.getElementById('emp-name').value = emp.nome;
    document.getElementById('emp-badge').value = emp.cracha;
    document.getElementById('emp-admission').value = emp.admissao;
    document.getElementById('emp-branch').value = emp.filialId;

    let targetDept = emp.deptId;
    if (targetDept === 'dept-1792071704664') targetDept = 'dept-admin-sponto';
    if (!appState.departamentos.some(d => d.id === targetDept)) {
      const sp = appState.departamentos.find(d => d.nome === 'ADMIN-S/PONTO');
      targetDept = sp ? sp.id : (appState.departamentos[0]?.id || 'dept-admin');
    }
    deptSelect.value = targetDept;

    if (checkRegistra) {
      checkRegistra.checked = (emp.registraPonto !== false && emp.registraPonto !== 'nao' && emp.registraPonto !== 'false');
    }
    if (checkNaoRecebeVa) {
      checkNaoRecebeVa.checked = !!(emp.naoRecebeVa || emp.recebeVa === false);
    }

    const isAp = !!(emp.aprendiz || emp.isAprendiz);
    if (checkAprendiz) checkAprendiz.checked = isAp;

    const trabalhaSab = emp.trabalhaSabado !== undefined
      ? (emp.trabalhaSabado === true || emp.trabalhaSabado === 'sim')
      : !isAp;
    if (checkTrabalhaSabado) checkTrabalhaSabado.checked = trabalhaSab;

    const isDemitido = emp.status === 'demitido';
    if (checkDemitido) checkDemitido.checked = isDemitido;
    if (demissaoGroup) demissaoGroup.style.display = isDemitido ? 'block' : 'none';
    if (demissaoInput) demissaoInput.value = emp.dataDemissao || '';

    // Campos estendidos NGPonto (armazenados de forma limpa nos inputs ocultos)
    const inCpf = document.getElementById('emp-cpf'); if (inCpf) inCpf.value = emp.cpf || '';
    const inPis = document.getElementById('emp-pis'); if (inPis) inPis.value = emp.pis || '';
    const inCargo = document.getElementById('emp-cargo'); if (inCargo) inCargo.value = emp.cargo || '';
    const inRel = document.getElementById('emp-relogio-vinculo'); if (inRel) inRel.value = emp.relogioVinculo || 'relogio1_producao';
    const inQ = document.getElementById('emp-quadro-ng'); if (inQ) inQ.value = emp.quadroNG || emp.horario1 || '';
    const inIdR = document.getElementById('emp-idregistro-ng'); if (inIdR) inIdR.value = emp.idregistro || emp.idregistroNG || '';
    const inIdOw = document.getElementById('emp-idowner-ng'); if (inIdOw) inIdOw.value = emp.idowner || emp.idownerNG || '';

    // Indicador compacto de integração NGPonto
    if (syncInfo) {
      if (emp.cargo || emp.cpf || emp.quadroNG) {
        syncInfo.style.display = 'block';
        if (badgeTxt) badgeTxt.textContent = '✨ Integrado com NGPonto';
        if (detLine) {
          const sabTxt = trabalhaSab ? 'Trabalha Sábado' : 'Folga Sábado';
          const cpfFmt = emp.cpf ? (emp.cpf.length >= 11 ? `${emp.cpf.slice(0,3)}.${emp.cpf.slice(3,6)}.${emp.cpf.slice(6,9)}-${emp.cpf.slice(9)}` : emp.cpf) : 'Não informado';
          detLine.textContent = `Cargo: ${emp.cargo || 'Não informado'} • CPF: ${cpfFmt} • Escala: ${sabTxt}${isAp ? ' • Aprendiz' : ''}`;
        }
      } else {
        syncInfo.style.display = 'none';
      }
    }

    document.getElementById('modal-employee-title').innerHTML = '<span>👤</span> Editar Funcionário';
    updateEmpFeriasResumo(emp);
  } else {
    document.getElementById('emp-edit-id').value = '';
    document.getElementById('emp-name').value = '';
    const branchColabs = appState.colaboradores.filter(c => c.filialId === appState.activeBranchId);
    document.getElementById('emp-badge').value = branchColabs.length > 0
      ? Math.max(0, ...branchColabs.map(c => Number(c.cracha) || 0)) + 1
      : 1;
    document.getElementById('emp-admission').value = new Date().toISOString().split('T')[0];
    document.getElementById('emp-branch').value = appState.activeBranchId;

    const inCpf = document.getElementById('emp-cpf'); if (inCpf) inCpf.value = '';
    const inPis = document.getElementById('emp-pis'); if (inPis) inPis.value = '';
    const inCargo = document.getElementById('emp-cargo'); if (inCargo) inCargo.value = '';
    const inRel = document.getElementById('emp-relogio-vinculo'); if (inRel) inRel.value = 'relogio1_producao';
    const inQ = document.getElementById('emp-quadro-ng'); if (inQ) inQ.value = '';
    const inIdR = document.getElementById('emp-idregistro-ng'); if (inIdR) inIdR.value = '';
    const inIdOw = document.getElementById('emp-idowner-ng'); if (inIdOw) inIdOw.value = '';

    if (checkRegistra) checkRegistra.checked = true;
    if (checkNaoRecebeVa) checkNaoRecebeVa.checked = false;
    if (checkTrabalhaSabado) checkTrabalhaSabado.checked = true;
    if (checkAprendiz) checkAprendiz.checked = false;
    if (checkDemitido) checkDemitido.checked = false;
    if (demissaoGroup) demissaoGroup.style.display = 'none';
    if (demissaoInput) demissaoInput.value = '';

    if (syncInfo) syncInfo.style.display = 'none';

    document.getElementById('modal-employee-title').innerHTML = '<span>👤</span> Cadastrar Funcionário';
    updateEmpFeriasResumo(null);
  }

  openModal('modal-employee');

  // Para novos cadastros, se o crachá padrão já existir no NGPonto, puxa silenciosamente
  if (!empId) {
    autoBuscarDadosNGPonto(true);
  }
}

// Ao marcar como Jovem Aprendiz, sugere desmarcar o sábado por padrão
document.getElementById('emp-check-aprendiz')?.addEventListener('change', (e) => {
  const checkSab = document.getElementById('emp-check-trabalha-sabado') || document.getElementById('emp-check-aprendiz-sabado');
  if (e.target.checked && checkSab) {
    checkSab.checked = false;
  }
});

// Alterar visibilidade do campo de demissão ao marcar/desmarcar o checkbox
document.getElementById('emp-check-demitido')?.addEventListener('change', (e) => {
  const group = document.getElementById('group-emp-demissao');
  if (group) group.style.display = e.target.checked ? 'block' : 'none';
  if (e.target.checked) {
    const demInput = document.getElementById('emp-demissao');
    if (demInput && !demInput.value) {
      demInput.value = new Date().toISOString().split('T')[0];
    }
  }
});

document.getElementById('btn-save-employee')?.addEventListener('click', () => {
  const id = document.getElementById('emp-edit-id').value;
  const nome = document.getElementById('emp-name').value.trim();
  const cracha = parseInt(document.getElementById('emp-badge').value, 10);
  const admissao = document.getElementById('emp-admission').value;
  const filialId = document.getElementById('emp-branch').value;
  const deptId = document.getElementById('emp-dept').value;

  const registraPonto = !!document.getElementById('emp-check-registra-ponto')?.checked;
  const naoRecebeVa = !!document.getElementById('emp-check-nao-recebe-va')?.checked;
  const aprendiz = !!document.getElementById('emp-check-aprendiz')?.checked;

  const checkSab = document.getElementById('emp-check-trabalha-sabado') || document.getElementById('emp-check-aprendiz-sabado');
  const trabalhaSabado = checkSab ? checkSab.checked : !aprendiz;

  const isDemitido = !!document.getElementById('emp-check-demitido')?.checked;
  const status = isDemitido ? 'demitido' : 'ativo';
  const dataDemissao = isDemitido ? (document.getElementById('emp-demissao')?.value || '') : '';

  if (!nome || isNaN(cracha) || !admissao) {
    showToast('Preencha os campos obrigatórios corretamente.', 'warning');
    return;
  }

  if (isDemitido && !dataDemissao) {
    showToast('Informe a data de demissão para o cálculo rescisório de 10 dias.', 'warning');
    return;
  }

  const cpf = (document.getElementById('emp-cpf')?.value || '').trim();
  const pis = (document.getElementById('emp-pis')?.value || '').trim();
  const cargo = (document.getElementById('emp-cargo')?.value || '').trim();
  const relogioVinculo = document.getElementById('emp-relogio-vinculo')?.value || 'relogio1_producao';
  const quadroNG = (document.getElementById('emp-quadro-ng')?.value || '').trim();
  const idregistroNG = document.getElementById('emp-idregistro-ng')?.value || '';
  const idownerNG = document.getElementById('emp-idowner-ng')?.value || '';

  // Preserva campos extras do cadastro existente (ex: períodos de férias programados)
  const existingEmp = id ? appState.colaboradores.find(c => c.id === id) : null;
  const colabObj = normalizeColaborador({
    ...(existingEmp || {}),
    id: id || ('colab-' + cracha),
    nome,
    cracha,
    cpf,
    pis,
    cargo,
    relogioVinculo,
    quadroNG,
    idregistro: idregistroNG || existingEmp?.idregistro,
    idregistroNG: idregistroNG || existingEmp?.idregistroNG,
    idowner: idownerNG || existingEmp?.idowner,
    idownerNG: idownerNG || existingEmp?.idownerNG,
    admissao,
    filialId,
    deptId,
    aprendiz,
    isAprendiz: aprendiz,
    trabalhaSabado,
    naoRecebeVa,
    recebeVa: !naoRecebeVa,
    registraPonto,
    status,
    isDemitido: isDemitido,
    dataDemissao
  });

  if (id) {
    const idx = appState.colaboradores.findIndex(c => c.id === id);
    if (idx !== -1) {
      appState.colaboradores[idx] = colabObj;
    } else {
      appState.colaboradores.push(colabObj);
    }
  } else {
    appState.colaboradores.push(colabObj);
  }

  const colabKeyId = id || ('colab-' + cracha);

  // GERAÇÃO AUTOMÁTICA DE AVISOS NO MURAL (CLT Art. 477 - 10 dias corridos + 1 dia após para assinatura)
  if (status === 'demitido' && dataDemissao) {
    const prazoFatal = addCalendarDays(dataDemissao, 10);
    const dataAssinatura = addCalendarDays(prazoFatal, 1);
    // Aviso de pagamento 1 dia antes do prazo fatal (1 dia de folga além do aviso)
    const avisoPagtoData = getPaymentNoticeDate(prazoFatal, filialId);
    const avisoPagtoId = 'aviso-rescisao-' + colabKeyId;
    const avisoAssinId = 'aviso-assinatura-' + colabKeyId;

    if (!appState.avisos) appState.avisos = [];

    // 1. Aviso de Pagamento da Rescisão (10 dias corridos CLT Art. 477)
    let existingPagtoIdx = appState.avisos.findIndex(a => a.id === avisoPagtoId);
    if (existingPagtoIdx === -1) {
      existingPagtoIdx = appState.avisos.findIndex(a => a.colabId === colabKeyId && a.tipo === 'rescisao' && !a.isAssinaturaDoc && !a.autoRollover && !String(a.id || '').startsWith('aviso-assinatura-') && !a.feriasId);
    }
    const isPagtoDone = existingPagtoIdx !== -1 ? appState.avisos[existingPagtoIdx].concluido : false;

    const avisoPagtoObj = {
      id: avisoPagtoId,
      data: avisoPagtoData,
      prazoLegal: prazoFatal,
      tipo: 'rescisao',
      titulo: `🔴 Prazo Limite Rescisão - ${nome} (10 dias CLT Art. 477)`,
      descricao: `Prazo legal fatal de 10 dias corridos para homologação e pagamento de verbas rescisórias (Art. 477, § 6º da CLT). Data da demissão: ${formatDateBR(dataDemissao)}. Prazo fatal: ${formatDateBR(prazoFatal)}. Aviso antecipado para ${formatDateBR(avisoPagtoData)} (1 dia de folga além do aviso).`,
      filialId: filialId,
      colabId: colabKeyId,
      concluido: isPagtoDone,
      concluidoEm: existingPagtoIdx !== -1 ? appState.avisos[existingPagtoIdx].concluidoEm : null,
      createdAt: existingPagtoIdx !== -1 ? appState.avisos[existingPagtoIdx].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (existingPagtoIdx !== -1) {
      appState.avisos[existingPagtoIdx] = { ...appState.avisos[existingPagtoIdx], ...avisoPagtoObj };
    } else {
      appState.avisos.unshift(avisoPagtoObj);
    }

    // 2. Aviso de Chamar para Assinar Documentos Rescisórios (1 dia após o pagamento + Prorrogação diária)
    const existingAssinIdx = appState.avisos.findIndex(a => a.id === avisoAssinId || (a.colabId === colabKeyId && (a.isAssinaturaDoc || a.autoRollover)));
    const isAssinDone = existingAssinIdx !== -1 ? appState.avisos[existingAssinIdx].concluido : false;
    const initialAssinDate = (existingAssinIdx !== -1 && isAssinDone)
      ? appState.avisos[existingAssinIdx].data
      : dataAssinatura;

    const avisoAssinObj = {
      id: avisoAssinId,
      data: initialAssinDate,
      dataOriginalAgendada: dataAssinatura,
      tipo: 'rescisao',
      isAssinaturaDoc: true,
      autoRollover: true,
      titulo: `📝 Chamar para Assinar Documentos Rescisórios - ${nome}`,
      descricao: `Chamar o colaborador ${nome} para conferência e assinatura dos documentos rescisórios (TRCT, guias do FGTS e Seguro-Desemprego). Prazo de pagamento: ${formatDateBR(prazoFatal)}. Data agendada da assinatura: ${formatDateBR(dataAssinatura)}. (Caso não seja concluído ao final do dia, este aviso avança automaticamente para o dia seguinte até ser marcado como feito).`,
      filialId: filialId,
      colabId: colabKeyId,
      concluido: isAssinDone,
      concluidoEm: existingAssinIdx !== -1 ? appState.avisos[existingAssinIdx].concluidoEm : null,
      createdAt: existingAssinIdx !== -1 ? appState.avisos[existingAssinIdx].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (existingAssinIdx !== -1) {
      appState.avisos[existingAssinIdx] = { ...appState.avisos[existingAssinIdx], ...avisoAssinObj };
    } else {
      appState.avisos.unshift(avisoAssinObj);
    }
  } else if (status === 'ativo') {
    if (appState.avisos && Array.isArray(appState.avisos)) {
      appState.avisos = appState.avisos.filter(a => {
        const isThisColab = a.colabId === colabKeyId || a.id === ('aviso-rescisao-' + colabKeyId) || a.id === ('aviso-assinatura-' + colabKeyId);
        return !(isThisColab && (a.tipo === 'rescisao' || a.isAssinaturaDoc) && !a.concluido);
      });
    }
  }

  // Grava imediatamente no LocalStorage, sincroniza abas abertas e envia à nuvem sem espera
  saveStateToStorage(true, true);
  clearModalDraft(); closeModal('modal-employee');
  renderCurrentView();

  if (status === 'demitido') {
    const pFatal = addCalendarDays(dataDemissao, 10);
    const pAviso = getPaymentNoticeDate(pFatal, filialId);
    const dAssin = addCalendarDays(pFatal, 1);
    showToast(`Colaborador salvo! Avisos gerados: 🔴 Pagamento (aviso ${formatDateBR(pAviso)} • prazo ${formatDateBR(pFatal)}) e 📝 Assinatura (${formatDateBR(dAssin)} com prorrogação diária)!`, 'purple');
  } else {
    showToast('Colaborador salvo com sucesso!', 'success');
  }
});

// ==========================================================================
// PROGRAMAÇÃO DE FÉRIAS (botão no modal de edição do colaborador)
// - Gera aviso no mural do início das férias
// - Gera aviso de pagamento 3 dias antes do início (prazo CLT Art. 145 = 2 dias antes + 1 dia de folga)
// - Marca os dias como FÉRIAS no Dashboard de Ponto (sem sobrepor registros existentes)
// ==========================================================================
let feriasEditingColabId = null;

function getColabFerias(colab) {
  return (colab && Array.isArray(colab.ferias)) ? colab.ferias : [];
}

function daysBetweenISO(a, b) {
  const da = new Date(a + 'T12:00:00');
  const db = new Date(b + 'T12:00:00');
  return Math.round((db - da) / 86400000);
}

function computeFeriasDates(inicio, dias, branchId) {
  const fim = addCalendarDays(inicio, dias - 1);
  const retorno = addCalendarDays(fim, 1);
  const prazoPagto = addCalendarDays(inicio, -2); // CLT Art. 145: até 2 dias antes do início
  const avisoPagto = getPaymentNoticeDate(prazoPagto, branchId); // 3 dias antes (1 dia de folga)
  return { inicio, fim, retorno, prazoPagto, avisoPagto };
}

function updateEmpFeriasResumo(colab) {
  const resumo = document.getElementById('emp-ferias-resumo');
  const btn = document.getElementById('btn-open-ferias');
  if (btn) {
    btn.disabled = !colab;
    btn.title = colab ? 'Informar o período de férias do colaborador' : 'Salve o colaborador antes de programar as férias';
  }
  if (!resumo) return;
  if (!colab) {
    resumo.textContent = 'Salve o cadastro do colaborador para programar as férias.';
    return;
  }
  const list = getColabFerias(colab).slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
  if (list.length === 0) {
    resumo.textContent = 'Nenhum período de férias programado.';
    return;
  }
  const today = getTodayISOLocal();
  const next = list.find(f => f.fim >= today);
  if (next) {
    resumo.textContent = `Próximas/atuais férias: ${formatDateBR(next.inicio)} a ${formatDateBR(next.fim)} • ${list.length} período(s) cadastrado(s)`;
  } else {
    const last = list[list.length - 1];
    resumo.textContent = `Últimas férias: ${formatDateBR(last.inicio)} a ${formatDateBR(last.fim)} • ${list.length} período(s) cadastrado(s)`;
  }
}

function openFeriasModal(colabId) {
  const colab = appState.colaboradores.find(c => c.id === colabId);
  if (!colab) {
    showToast('Salve o colaborador antes de programar as férias.', 'warning');
    return;
  }
  feriasEditingColabId = colabId;

  const branch = appState.filiais.find(f => f.id === colab.filialId);
  const dept = appState.departamentos.find(d => d.id === colab.deptId);
  document.getElementById('ferias-colab-nome').textContent = colab.nome;
  document.getElementById('ferias-colab-sub').textContent = 'Crachá: ' + colab.cracha + ' • Depto: ' + (dept ? dept.nome : 'Geral') + ' • Filial: ' + (branch ? branch.nome : '');

  document.getElementById('ferias-inicio').value = '';
  document.getElementById('ferias-dias').value = 30;
  document.getElementById('ferias-fim').value = '';

  updateFeriasPreview();
  renderFeriasList();
  openModal('modal-ferias');
  setTimeout(() => document.getElementById('ferias-inicio')?.focus(), 80);
}

function updateFeriasPreview() {
  const preview = document.getElementById('ferias-preview');
  if (!preview) return;
  const colab = appState.colaboradores.find(c => c.id === feriasEditingColabId);
  const inicio = document.getElementById('ferias-inicio')?.value;
  const dias = parseInt(document.getElementById('ferias-dias')?.value, 10);

  if (!inicio || !(dias > 0)) {
    preview.innerHTML = 'Informe a data de início para visualizar os avisos que serão gerados.';
    return;
  }

  const d = computeFeriasDates(inicio, dias, colab ? colab.filialId : appState.activeBranchId);
  preview.innerHTML = `
    📅 Período: <strong>${formatDateBR(d.inicio)} a ${formatDateBR(d.fim)}</strong> (${dias} dias) • Retorno: <strong>${formatDateBR(d.retorno)}</strong><br>
    🏖️ Aviso no mural (início das férias): <strong>${formatDateBR(d.inicio)}</strong><br>
    💰 Aviso de pagamento: <strong>${formatDateBR(d.avisoPagto)}</strong> — prazo legal ${formatDateBR(d.prazoPagto)} (CLT Art. 145: até 2 dias antes + 1 dia de folga)<br>
    📊 Os dias serão marcados como <strong>FÉRIAS</strong> no Dashboard de Ponto (sem sobrepor registros existentes).
  `;
}

function renderFeriasList() {
  const el = document.getElementById('ferias-list');
  if (!el) return;
  const colab = appState.colaboradores.find(c => c.id === feriasEditingColabId);
  const list = getColabFerias(colab).slice().sort((a, b) => b.inicio.localeCompare(a.inicio));

  if (list.length === 0) {
    el.innerHTML = '<div class="ferias-empty">Nenhum período de férias cadastrado para este colaborador.</div>';
    return;
  }

  el.innerHTML = list.map(f => {
    const d = computeFeriasDates(f.inicio, f.dias, colab.filialId);
    return `
      <div class="ferias-item">
        <div>
          <div class="ferias-item-periodo">${formatDateBR(f.inicio)} a ${formatDateBR(f.fim)}</div>
          <div class="ferias-item-sub">${f.dias} dias • Retorno: ${formatDateBR(d.retorno)} • Aviso de pagamento: ${formatDateBR(d.avisoPagto)}</div>
        </div>
        <button type="button" class="btn btn-danger btn-sm btn-remove-ferias" data-id="${f.id}" title="Remover período e seus avisos">🗑️ Remover</button>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.btn-remove-ferias').forEach(btn => {
    btn.addEventListener('click', () => removeFeriasPeriodo(btn.dataset.id));
  });
}

function generateFeriasNotices(colab, periodo) {
  if (!appState.avisos) appState.avisos = [];
  const d = computeFeriasDates(periodo.inicio, periodo.dias, colab.filialId);
  const now = new Date().toISOString();
  const avisoInicioId = 'aviso-ferias-' + periodo.id;
  const avisoPagtoId = 'aviso-ferias-pagto-' + periodo.id;

  const avisoInicio = {
    id: avisoInicioId,
    data: periodo.inicio,
    tipo: 'ferias',
    titulo: `🏖️ Início das Férias - ${colab.nome} (${periodo.dias} dias)`,
    descricao: `O colaborador ${colab.nome} (Crachá ${colab.cracha}) entra em férias em ${formatDateBR(periodo.inicio)}. Período: ${formatDateBR(periodo.inicio)} a ${formatDateBR(periodo.fim)} (${periodo.dias} dias). Retorno ao trabalho: ${formatDateBR(d.retorno)}.`,
    filialId: colab.filialId,
    colabId: colab.id,
    feriasId: periodo.id,
    concluido: false,
    concluidoEm: null,
    createdAt: now,
    updatedAt: now
  };

  const avisoPagto = {
    id: avisoPagtoId,
    data: d.avisoPagto,
    prazoLegal: d.prazoPagto,
    tipo: 'ferias',
    titulo: `💰 Pagamento de Férias + 1/3 - ${colab.nome} (prazo ${formatDateBR(d.prazoPagto)})`,
    descricao: `Efetuar o pagamento da remuneração das férias + 1/3 constitucional de ${colab.nome}. Prazo legal: até 2 dias antes do início (CLT Art. 145) = ${formatDateBR(d.prazoPagto)}. Aviso antecipado para ${formatDateBR(d.avisoPagto)} (1 dia de folga além do aviso). Início das férias: ${formatDateBR(periodo.inicio)}.`,
    filialId: colab.filialId,
    colabId: colab.id,
    feriasId: periodo.id,
    concluido: false,
    concluidoEm: null,
    createdAt: now,
    updatedAt: now
  };

  appState.avisos = appState.avisos.filter(a => a.id !== avisoInicioId && a.id !== avisoPagtoId);
  appState.avisos.unshift(avisoPagto, avisoInicio);
  return d;
}

function applyFeriasToPonto(colab, periodo) {
  let preserved = 0;
  const note = `Férias programadas (${formatDateBR(periodo.inicio)} a ${formatDateBR(periodo.fim)})`;
  for (let i = 0; i < periodo.dias; i++) {
    const iso = addCalendarDays(periodo.inicio, i);
    const key = colab.id + '_' + iso;
    const reg = appState.registrosPonto[key];
    // Não sobrepõe registros já existentes (atestado, falta, afastamento etc.)
    if (reg && reg.override && !['AUTO', 'OK', 'VAZIO', 'FÉRIAS'].includes(reg.override)) {
      preserved++;
      continue;
    }
    appState.registrosPonto[key] = {
      override: 'FÉRIAS',
      override2: '',
      resolution: 'NENHUMA',
      punches: { em: '', sm: '', et: '', st: '' },
      note,
      feriasId: periodo.id
    };
  }
  return preserved;
}

function saveFeriasFromModal() {
  const colab = appState.colaboradores.find(c => c.id === feriasEditingColabId);
  if (!colab) return;

  const inicio = document.getElementById('ferias-inicio')?.value;
  const dias = parseInt(document.getElementById('ferias-dias')?.value, 10);

  if (!inicio) {
    showToast('Informe a data de início das férias.', 'warning');
    document.getElementById('ferias-inicio')?.focus();
    return;
  }
  if (!(dias >= 1 && dias <= 30)) {
    showToast('A quantidade de dias de férias deve estar entre 1 e 30.', 'warning');
    return;
  }
  if (colab.admissao && inicio < colab.admissao) {
    showToast('O início das férias não pode ser anterior à admissão do colaborador.', 'warning');
    return;
  }
  if (colab.status === 'demitido' && colab.dataDemissao && inicio > colab.dataDemissao) {
    showToast('O início das férias é posterior à data de demissão do colaborador.', 'warning');
    return;
  }

  const fim = addCalendarDays(inicio, dias - 1);
  const overlap = getColabFerias(colab).find(f => !(fim < f.inicio || inicio > f.fim));
  if (overlap) {
    showToast(`Período em conflito com férias já cadastradas (${formatDateBR(overlap.inicio)} a ${formatDateBR(overlap.fim)}).`, 'warning');
    return;
  }

  const periodo = { id: 'ferias-' + Date.now(), inicio, fim, dias, createdAt: new Date().toISOString() };
  colab.ferias = [...getColabFerias(colab), periodo];

  const d = generateFeriasNotices(colab, periodo);
  const preserved = applyFeriasToPonto(colab, periodo);

  saveStateToStorage(true, true);
  renderFeriasList();
  updateEmpFeriasResumo(colab);
  document.getElementById('ferias-inicio').value = '';
  document.getElementById('ferias-fim').value = '';
  document.getElementById('ferias-dias').value = 30;
  updateFeriasPreview();
  renderCurrentView();

  showToast(`Férias salvas! Avisos no mural: 🏖️ Início (${formatDateBR(inicio)}) e 💰 Pagamento (${formatDateBR(d.avisoPagto)})` + (preserved > 0 ? ` • ${preserved} dia(s) com registro existente preservado(s)` : ''), 'purple');
}

function removeFeriasPeriodo(periodoId) {
  const colab = appState.colaboradores.find(c => c.id === feriasEditingColabId);
  if (!colab) return;
  const periodo = getColabFerias(colab).find(f => f.id === periodoId);
  if (!periodo) return;
  if (!confirm(`Remover as férias de ${formatDateBR(periodo.inicio)} a ${formatDateBR(periodo.fim)} e os avisos gerados no mural?`)) return;

  colab.ferias = getColabFerias(colab).filter(f => f.id !== periodoId);

  // Desfaz as marcações de FÉRIAS geradas por este período no Dashboard de Ponto
  for (let i = 0; i < periodo.dias; i++) {
    const key = colab.id + '_' + addCalendarDays(periodo.inicio, i);
    const reg = appState.registrosPonto[key];
    if (reg && reg.feriasId === periodoId && reg.override === 'FÉRIAS') {
      appState.registrosPonto[key] = { override: 'AUTO', resolution: 'NENHUMA', note: '' };
    }
  }

  // Remove os avisos pendentes deste período
  appState.avisos = (appState.avisos || []).filter(a =>
    !((a.id === 'aviso-ferias-' + periodoId || a.id === 'aviso-ferias-pagto-' + periodoId) && !a.concluido)
  );

  saveStateToStorage(true, true);
  renderFeriasList();
  updateEmpFeriasResumo(colab);
  renderCurrentView();
  showToast('Período de férias removido.', 'info');
}

document.getElementById('btn-open-ferias')?.addEventListener('click', () => {
  const empId = document.getElementById('emp-edit-id')?.value;
  openFeriasModal(empId);
});
document.getElementById('btn-save-ferias')?.addEventListener('click', saveFeriasFromModal);

// Sincroniza Início + Quantidade de Dias <-> Último Dia
['ferias-inicio', 'ferias-dias'].forEach(fieldId => {
  document.getElementById(fieldId)?.addEventListener('input', () => {
    const inicio = document.getElementById('ferias-inicio').value;
    const dias = parseInt(document.getElementById('ferias-dias').value, 10);
    if (inicio && dias > 0) {
      document.getElementById('ferias-fim').value = addCalendarDays(inicio, dias - 1);
    }
    updateFeriasPreview();
  });
});
document.getElementById('ferias-fim')?.addEventListener('input', () => {
  const inicio = document.getElementById('ferias-inicio').value;
  const fim = document.getElementById('ferias-fim').value;
  if (inicio && fim && fim >= inicio) {
    document.getElementById('ferias-dias').value = daysBetweenISO(inicio, fim) + 1;
  }
  updateFeriasPreview();
});

function deleteEmployee(empId) {
  const emp = appState.colaboradores.find(c => c.id === empId);
  if (!emp) return;
  if (!confirm('Confirma a exclusão do colaborador "' + emp.nome + '" (Crachá: ' + emp.cracha + ')?')) return;

  appState.colaboradores = appState.colaboradores.filter(c => c.id !== empId);
  saveStateToStorage(true, true);
  renderCurrentView();
  showToast('Colaborador removido.', 'info');
}

// RENDERIZAÇÃO DA VIEW DE FILIAIS E DEPARTAMENTOS
function renderEstruturaView() {
  const fBody = document.getElementById('filiais-tbody');
  const dBody = document.getElementById('deptos-tbody');

  // Filiais
  fBody.innerHTML = '';
  appState.filiais.forEach(f => {
    const count = appState.colaboradores.filter(c => c.filialId === f.id).length;
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><strong>' + f.nome + '</strong></td><td>' + f.cidade + '</td><td class="text-center"><span class="branch-badge">' + count + '</span></td><td class="text-center"><button class="btn btn-secondary btn-sm btn-edit-branch" data-id="' + f.id + '">✏️</button> <button class="btn btn-danger btn-sm btn-del-branch" data-id="' + f.id + '">🗑️</button></td>';
    fBody.appendChild(tr);
  });

  fBody.querySelectorAll('.btn-edit-branch').forEach(b => {
    b.addEventListener('click', () => openBranchModal(b.dataset.id));
  });
  fBody.querySelectorAll('.btn-del-branch').forEach(b => {
    b.addEventListener('click', () => deleteBranch(b.dataset.id));
  });

  // Departamentos
  dBody.innerHTML = '';
  appState.departamentos.forEach(d => {
    const count = appState.colaboradores.filter(c => c.deptId === d.id).length;
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><strong>' + d.nome + '</strong></td><td class="text-center"><span class="branch-badge">' + count + '</span></td><td class="text-center"><button class="btn btn-danger btn-sm btn-del-dept" data-id="' + d.id + '">🗑️</button></td>';
    dBody.appendChild(tr);
  });

  dBody.querySelectorAll('.btn-del-dept').forEach(b => {
    b.addEventListener('click', () => deleteDept(b.dataset.id));
  });
}

function openBranchModal(branchId = null) {
  if (branchId) {
    const f = appState.filiais.find(b => b.id === branchId);
    if (!f) return;
    document.getElementById('branch-edit-id').value = f.id;
    document.getElementById('branch-name').value = f.nome;
    document.getElementById('branch-city').value = f.cidade;
  } else {
    document.getElementById('branch-edit-id').value = '';
    document.getElementById('branch-name').value = '';
    document.getElementById('branch-city').value = '';
  }
  openModal('modal-branch');
}

document.getElementById('btn-save-branch')?.addEventListener('click', () => {
  const id = document.getElementById('branch-edit-id').value;
  const nome = document.getElementById('branch-name').value.trim();
  const cidade = document.getElementById('branch-city').value.trim();

  if (!nome || !cidade) {
    showToast('Informe o nome e cidade da filial.', 'warning');
    return;
  }

  if (id) {
    const idx = appState.filiais.findIndex(f => f.id === id);
    if (idx !== -1) appState.filiais[idx] = { id, nome, cidade };
  } else {
    const newId = 'branch-' + Date.now();
    appState.filiais.push({ id: newId, nome, cidade });
  }

  saveStateToStorage(true, true);
  closeModal('modal-branch');
  renderCurrentView();
  showToast('Filial gravada!', 'success');
});

function deleteBranch(branchId) {
  if (appState.filiais.length <= 1) {
    showToast('O sistema precisa conter ao menos uma filial cadastrada.', 'warning');
    return;
  }
  const f = appState.filiais.find(b => b.id === branchId);
  if (!confirm('Deseja excluir a filial "' + f.nome + '"?')) return;

  appState.filiais = appState.filiais.filter(b => b.id !== branchId);
  if (appState.activeBranchId === branchId) {
    appState.activeBranchId = appState.filiais[0].id;
  }
  saveStateToStorage(true, true);
  renderCurrentView();
}

document.getElementById('btn-save-dept')?.addEventListener('click', () => {
  const nome = document.getElementById('dept-name').value.trim();
  if (!nome) return;

  const newId = 'dept-' + Date.now();
  appState.departamentos.push({ id: newId, nome });
  appState.departamentos = normalizeDepartamentos(appState.departamentos);
  document.getElementById('dept-name').value = '';

  saveStateToStorage(true, true);
  closeModal('modal-dept');
  renderCurrentView();
  showToast('Departamento "' + nome + '" criado!', 'success');
});

function deleteDept(deptId) {
  if (appState.departamentos.length <= 1) {
    showToast('Mantenha pelo menos um departamento.', 'warning');
    return;
  }
  const d = appState.departamentos.find(x => x.id === deptId);
  if (!confirm('Confirma a exclusão do departamento "' + (d ? d.nome : deptId) + '"?')) return;
  appState.departamentos = appState.departamentos.filter(d => d.id !== deptId);
  // Reatribui colaboradores órfãos para o departamento padrão
  const fallbackDept = appState.departamentos[0].id;
  appState.colaboradores.forEach(c => {
    if (c.deptId === deptId) c.deptId = fallbackDept;
  });
  saveStateToStorage(true, true);
  renderCurrentView();
  showToast('Departamento excluído com sucesso.', 'info');
}

function renderFeriadosView() {
  const tbody = document.getElementById('feriados-tbody');
  if (!tbody) return;

  const branchMap = Object.fromEntries(appState.filiais.map(f => [f.id, f.nome]));
  const sorted = [...appState.feriados].sort((a, b) => a.data.localeCompare(b.data));

  tbody.innerHTML = '';
  sorted.forEach(fer => {
    const escopoDesc = fer.escopo === 'NACIONAL' ? 'Nacional (Todas as filiais)' : (branchMap[fer.escopo] || 'Filial Específica');
    const tr = document.createElement('tr');
    tr.innerHTML = '<td style="font-family: var(--font-mono); font-weight:700;">' + formatDateBR(fer.data) + '</td><td><strong>' + fer.nome + '</strong></td><td>' + escopoDesc + '</td><td><span style="display:inline-block; font-size:10px; padding:2px 8px; border-radius:3px; background:rgba(64, 21, 184, 0.4); color:var(--color-cyan); font-weight:600;">' + (fer.escopo === 'NACIONAL' ? 'Nacional' : 'Local') + '</span></td><td class="text-center"><button class="btn btn-danger btn-sm btn-del-feriado" data-id="' + fer.id + '">🗑️ Excluir</button></td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-del-feriado').forEach(b => {
    b.addEventListener('click', () => {
      appState.feriados = appState.feriados.filter(f => f.id !== b.dataset.id);
      saveStateToStorage();
      renderCurrentView();
      showToast('Feriado removido do calendário.', 'info');
    });
  });
}

function openHolidayModal() {
  const selectScope = document.getElementById('holiday-scope');
  selectScope.innerHTML = '<option value="NACIONAL">Nacional (Todas as filiais)</option>' +
    appState.filiais.map(f => '<option value="' + f.id + '">Local: ' + f.nome + '</option>').join('');

  document.getElementById('holiday-date').value = '';
  document.getElementById('holiday-name').value = '';
  openModal('modal-holiday');
}

document.getElementById('btn-save-holiday')?.addEventListener('click', () => {
  const data = document.getElementById('holiday-date').value;
  const nome = document.getElementById('holiday-name').value.trim();
  const escopo = document.getElementById('holiday-scope').value;

  if (!data || !nome) {
    showToast('Preencha a data e descrição do feriado.', 'warning');
    return;
  }

  const newId = 'fer-' + Date.now();
  appState.feriados.push({ id: newId, data, nome, escopo });
  saveStateToStorage();
  closeModal('modal-holiday');
  renderCurrentView();
  showToast('Feriado incluído no calendário!', 'success');
});

// ==========================================================================
// 9. EXPORTAÇÕES (CSV E IMPRESSÃO) & BACKUP
// ==========================================================================

function exportMatrixCSV() {
  const year = appState.currentYear;
  const month = appState.currentMonth;
  const daysInMonth = getDaysInMonth(year, month);
  const employees = getFilteredAndSortedEmployees(true);
  const deptMap = Object.fromEntries(appState.departamentos.map(d => [d.id, d.nome]));

  let csv = 'Crachá;Nome;Departamento;';
  for (let d = 1; d <= daysInMonth; d++) {
    csv += String(d).padStart(2, '0') + '/' + String(month + 1).padStart(2, '0') + ';';
  }
  csv += 'Qtd_DSR\n';

  employees.forEach(colab => {
    csv += colab.cracha + ';"' + colab.nome + '";"' + (deptMap[colab.deptId] || '') + '";';
    for (let d = 1; d <= daysInMonth; d++) {
      const isoStr = formatDateISO(year, month, d);
      const res = getResolvedDayStatus(colab.id, isoStr, appState.activeBranchId);
      csv += res.display + ';';
    }
    const dsr = calculateDsrForEmployee(colab.id, year, month, appState.activeBranchId);
    csv += dsr.totalDsrLost + '\n';
  });

  downloadFile('ponto_' + MESES_PT[month] + '_' + year + '.csv', csv, 'text/csv;charset=utf-8;');
}

function exportVACSV() {
  const year = appState.currentYear;
  const month = appState.currentMonth;
  const employees = getFilteredAndSortedEmployees(false);
  const deptMap = Object.fromEntries(appState.departamentos.map(d => [d.id, d.nome]));

  let csv = 'Crachá;Nome;Departamento;Aprendiz;Taxa_Dia_RS;Registra_Ponto;Situacao;Data_Demissao;Dias_Uteis;Dias_OK;Meios_Dias;Faltas_Atestados;Valor_Liquido_RS;Valor_Descontado_RS\n';
  employees.forEach(colab => {
    const va = calculateVAForEmployee(colab.id, year, month, appState.activeBranchId);
    const isAprendiz = !!(colab.aprendiz || colab.isAprendiz);
    const naoRecebeVa = !!(colab.naoRecebeVa || colab.recebeVa === false);
    const taxaDia = naoRecebeVa ? '0.00' : (isAprendiz ? '4.00' : '8.00');
    csv += colab.cracha + ';"' + colab.nome + '";"' + (deptMap[colab.deptId] || '') + '";"' + (isAprendiz ? 'SIM' : 'NAO') + '";' + taxaDia + ';"' + (colab.registraPonto ? 'SIM' : 'NAO') + '";"' + (colab.status || 'ativo') + '";"' + formatDateBR(colab.dataDemissao) + '";' + va.totalBusinessDays + ';' + va.fullDaysWorked + ';' + va.halfDaysWorked + ';' + va.absenceDays + ';' + va.valorLiquido.toFixed(2) + ';' + va.valorDescontado.toFixed(2) + '\n';
  });

  downloadFile('fechamento_VA_' + MESES_PT[month] + '_' + year + '.csv', csv, 'text/csv;charset=utf-8;');
}

function downloadFile(filename, content, type) {
  const blob = new Blob(['\uFEFF' + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Arquivo "' + filename + '" exportado!', 'success');
}

// ==========================================================================
// TEMA CLARO / ESCURO (LIGHT / DARK MODE)
// ==========================================================================
const THEME_STORAGE_KEY = 'euros_ponto_theme';

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
  applyTheme(savedTheme);

  const btnToggleTheme = document.getElementById('btn-toggle-theme');
  btnToggleTheme?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    showToast(`Modo ${nextTheme === 'light' ? 'Claro' : 'Escuro'} ativado`, 'info');
  });
}

function applyTheme(theme) {
  const iconSpan = document.getElementById('theme-icon');
  const labelSpan = document.getElementById('theme-label');
  const btnToggle = document.getElementById('btn-toggle-theme');

  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    if (iconSpan) iconSpan.textContent = '🌙';
    if (labelSpan) labelSpan.textContent = 'Modo Escuro';
    if (btnToggle) btnToggle.title = 'Alternar para Modo Escuro';
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    if (iconSpan) iconSpan.textContent = '💡';
    if (labelSpan) labelSpan.textContent = 'Modo Claro';
    if (btnToggle) btnToggle.title = 'Alternar para Modo Claro';
  }
}

// Baixar Cópia de Backup JSON Manualmente (sob demanda)
document.getElementById('btn-export-backup')?.addEventListener('click', () => {
  const dataStr = JSON.stringify(appState, null, 2);
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(`backup_ponto_euros_${dateStr}.json`, dataStr, 'application/json');
  showToast('Download do backup JSON gerado com sucesso!', 'success');
});

// Restaurar JSON
document.getElementById('btn-import-backup')?.addEventListener('click', () => {
  document.getElementById('input-import-file').click();
});

document.getElementById('input-import-file')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      let imported = JSON.parse(event.target.result);
      if (!imported.filiais || !imported.colaboradores) {
        showToast('Arquivo JSON inválido. Estrutura incorreta.', 'warning');
        return;
      }
      imported = migrateAppState(imported);
      appState.filiais = imported.filiais || [];
      appState.departamentos = normalizeDepartamentos(imported.departamentos || []);
      appState.colaboradores = (imported.colaboradores || []).map(normalizeColaborador);
      appState.feriados = imported.feriados || [];
      if (imported.avisos && Array.isArray(imported.avisos)) {
        appState.avisos = imported.avisos.map(normalizeAviso);
      }
      appState.registrosPonto = imported.registrosPonto || {};
      appState.carryOverDsr = imported.carryOverDsr || {};

      saveStateToStorage(true, true, true);
      renderCurrentView();
      showToast('Backup restaurado com sucesso!', 'success');
    } catch (err) {
      showToast('Erro ao importar arquivo JSON: formato inválido.', 'warning');
    }
  };
  reader.readAsText(file);
});

// Restaurar Base Mestra Oficial (100% Salva e Consolidada)
document.getElementById('btn-restore-master')?.addEventListener('click', () => {
  const master = (typeof window !== 'undefined') ? (window.GOLD_RECOVERY_DATA || window.BACKUP_DATA) : null;
  if (!master) {
    showToast('Base mestra não encontrada na memória.', 'warning');
    return;
  }

  const restored = JSON.parse(JSON.stringify(master));
  restored._masterVersion = MASTER_RECOVERY_VERSION;
  restored.updatedAt = new Date().toISOString();

  // Restauração completa sem resquícios de dados locais corrompidos
  appState.registrosPonto = JSON.parse(JSON.stringify(restored.registrosPonto || {}));
  appState.colaboradores = (restored.colaboradores || []).map(normalizeColaborador);
  appState.filiais = restored.filiais || appState.filiais;
  appState.departamentos = normalizeDepartamentos(restored.departamentos);
  appState.feriados = restored.feriados || appState.feriados;
  appState._masterVersion = MASTER_RECOVERY_VERSION;
  appState.updatedAt = restored.updatedAt;

  saveStateToStorage(true, true, true);
  renderCurrentView();
  showToast('Base Mestra Oficial 100% restaurada e sincronizada!', 'success');
});

// ==========================================================================
// 10. MODAL CONTROLS & UTILS
// ==========================================================================
function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add('active');
}

function closeModal(modalId) {
  if (modalId === 'modal-cell-detail' && currentEditingCell && currentEditingCell.colabId) {
    try { commitAndSaveCellDetail(false, false); } catch(e) {}
  }
  const m = document.getElementById(modalId);
  if (m) m.classList.remove('active');
  clearModalDraft();
}

document.querySelectorAll('.modal-close-btn, [data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.close || btn.closest('.modal-overlay')?.id;
    if (target) closeModal(target);
  });
});

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast ' + (type === 'purple' ? 'toast-purple' : '');
  const icon = type === 'success' ? '✅' : (type === 'warning' ? '⚠️' : 'ℹ️');
  toast.innerHTML = '<span>' + icon + '</span> <span>' + message + '</span>';

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================================================
// 11. INICIALIZAÇÃO E EVENT LISTENERS DO TOOLBAR
// ==========================================================================
function initEvents() {
  // Eventos do Calendário de Prazos Legais & Avisos
  document.getElementById('btn-novo-aviso')?.addEventListener('click', () => openAvisoModal());
  document.getElementById('btn-salvar-aviso')?.addEventListener('click', saveAvisoFromModal);

  // Navegação do Mês no Calendário
  document.getElementById('btn-cal-prev-month')?.addEventListener('click', () => {
    if (appState.calendarMonth === 0) {
      appState.calendarMonth = 11;
      appState.calendarYear--;
    } else {
      appState.calendarMonth--;
    }
    renderAvisosView();
  });

  document.getElementById('btn-cal-next-month')?.addEventListener('click', () => {
    if (appState.calendarMonth === 11) {
      appState.calendarMonth = 0;
      appState.calendarYear++;
    } else {
      appState.calendarMonth++;
    }
    renderAvisosView();
  });

  document.getElementById('btn-cal-today')?.addEventListener('click', () => {
    const now = new Date();
    appState.calendarYear = now.getFullYear();
    appState.calendarMonth = now.getMonth();
    renderAvisosView();
    showToast('Calendário posicionado no mês atual.', 'info');
  });

  // Alternância de Vistas no Calendário (Mês | Semana | Dia | Agenda)
  document.querySelectorAll('.cal-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.calViewMode = btn.dataset.calView || 'mes';
      renderAvisosView();
    });
  });

  // Filtros do Calendário
  document.getElementById('cal-filter-tipo')?.addEventListener('change', () => renderAvisosView());
  document.getElementById('cal-filter-status')?.addEventListener('change', () => renderAvisosView());
  document.getElementById('cal-filter-dept')?.addEventListener('change', (e) => {
    appState.calFilterDept = e.target.value;
    renderAvisosView();
  });

  // Filtro de Departamento da Matriz e VA
  document.getElementById('filter-dept-select')?.addEventListener('change', (e) => {
    appState.departmentFilter = e.target.value;
    saveStateToStorage();
    renderCurrentView();
  });

  // Assistente de Prazos Legais CLT / DP
  document.getElementById('select-preset-legal')?.addEventListener('change', (e) => {
    handleLegalPresetChange(e.target.value);
  });

  // Cálculo Automático de 10 Dias Corridos para Rescisão (CLT Art. 477) e Assinatura (+1 dia)
  document.getElementById('btn-calc-prazo-rescisao')?.addEventListener('click', () => {
    const demissaoVal = document.getElementById('input-calc-demissao-data')?.value;
    if (!demissaoVal) {
      showToast('Por favor, informe a data da demissão.', 'warning');
      return;
    }
    const preset = document.getElementById('select-preset-legal')?.value;
    const prazoFatal = addCalendarDays(demissaoVal, 10);
    const avisoData = document.getElementById('aviso-data');
    const colabSelect = document.getElementById('aviso-colab');
    const colabNome = (colabSelect && colabSelect.selectedIndex > 0)
      ? colabSelect.options[colabSelect.selectedIndex].text
      : 'Colaborador';

    const tituloInput = document.getElementById('aviso-titulo');
    const descInput = document.getElementById('aviso-descricao');

    if (preset === 'assinatura_rescisao') {
      const dataAssinatura = addCalendarDays(prazoFatal, 1);
      if (avisoData) avisoData.value = dataAssinatura;
      if (tituloInput) tituloInput.value = `📝 Chamar para Assinar Documentos Rescisórios - ${colabNome}`;
      if (descInput) descInput.value = `Chamar o colaborador para conferência e assinatura dos documentos rescisórios (TRCT, guias do FGTS e Seguro-Desemprego). Prazo de pagamento: ${formatDateBR(prazoFatal)}. Data agendada da assinatura: ${formatDateBR(dataAssinatura)}. (Caso não seja concluído ao final do dia, este aviso avança automaticamente para o dia seguinte até ser marcado como feito).`;
      showToast(`Data calculada para assinatura (1 dia após pagamento): ${formatDateBR(dataAssinatura)}!`, 'success');
    } else {
      if (avisoData) avisoData.value = getPaymentNoticeDate(prazoFatal, appState.activeBranchId);
      if (tituloInput) {
        tituloInput.value = `🔴 Prazo Limite Rescisão - ${colabNome} (10 dias CLT Art. 477)`;
      }
      if (descInput) {
        descInput.value = `Prazo legal fatal de 10 dias corridos para pagamento integral das verbas rescisórias e entrega de guias (Art. 477, § 6º da CLT). Data da demissão: ${formatDateBR(demissaoVal)}. Prazo máximo: ${formatDateBR(prazoFatal)}.`;
      }
      showToast(`Prazo de 10 dias aplicado! Data fatal: ${formatDateBR(prazoFatal)} • Aviso: ${formatDateBR(getPaymentNoticeDate(prazoFatal, appState.activeBranchId))}`, 'success');
    }
  });

  // Navegação de Mês da Matriz de Ponto
  document.getElementById('btn-prev-month')?.addEventListener('click', () => {
    if (appState.currentMonth === 0) {
      appState.currentMonth = 11;
      appState.currentYear--;
    } else {
      appState.currentMonth--;
    }
    saveStateToStorage();
    renderCurrentView();
  });

  document.getElementById('btn-next-month')?.addEventListener('click', () => {
    if (appState.currentMonth === 11) {
      appState.currentMonth = 0;
      appState.currentYear++;
    } else {
      appState.currentMonth++;
    }
    saveStateToStorage();
    renderCurrentView();
  });

  // Filtro de Situação (Ativos / Demitidos / Todos)
  const filterStatusSelect = document.getElementById('filter-status-select');
  filterStatusSelect?.addEventListener('change', (e) => {
    appState.statusFilter = e.target.value;
    saveStateToStorage();
    renderCurrentView();
  });

  // Modo Foco Toggle
  const focusBtn = document.getElementById('focus-toggle-btn');
  focusBtn?.addEventListener('click', () => {
    appState.focusMode = !appState.focusMode;
    focusBtn.classList.toggle('active', appState.focusMode);
    saveStateToStorage();
    renderCurrentView();
    showToast(appState.focusMode ? 'Modo Foco Ativado: Exibindo apenas colaboradores com pendências.' : 'Modo Foco Desativado: Exibindo todos.', 'purple');
  });

  // Campo de Busca
  const searchInput = document.getElementById('search-filter-input');
  searchInput?.addEventListener('input', (e) => {
    appState.searchFilter = e.target.value;
    renderCurrentView();
  });

  // Seletor de Ordenação
  const sortSelect = document.getElementById('sort-select');
  sortSelect?.addEventListener('change', (e) => {
    appState.sortBy = e.target.value;
    saveStateToStorage();
    renderCurrentView();
  });

  // Botão Limpar Filtros do Toolbar Principal (Ponto e VA)
  document.getElementById('btn-reset-main-filters')?.addEventListener('click', () => {
    resetMainAndColabFilters(false);
    saveStateToStorage();
    renderCurrentView();
    showToast('Filtros redefinidos: exibindo todos em ordem alfabética.', 'info');
  });

  // Inicialização das Máscaras de Tempo Inteligentes para Atrasos
  const inAtrasoMaior = document.getElementById('input-atraso-maior');
  const inAtrasoPequeno = document.getElementById('input-atraso-pequeno');
  if (inAtrasoMaior) setupTimeMask(inAtrasoMaior);
  if (inAtrasoPequeno) setupTimeMask(inAtrasoPequeno);

  // Botões de Limpar Horário dos Atrasos no Modal do Dia
  document.getElementById('btn-clear-atraso-maior')?.addEventListener('click', () => {
    const el = document.getElementById('input-atraso-maior');
    if (el) {
      el.value = '';
      delete el.dataset.hadInitialValue;
    }
  });
  document.getElementById('btn-clear-atraso-pequeno')?.addEventListener('click', () => {
    const el = document.getElementById('input-atraso-pequeno');
    if (el) {
      el.value = '';
      delete el.dataset.hadInitialValue;
    }
  });

  // Atalhos Rápidos
  document.getElementById('btn-novo-colaborador-quick')?.addEventListener('click', () => openEmployeeModal());
  document.getElementById('btn-abrir-novo-colab')?.addEventListener('click', () => openEmployeeModal());
  document.getElementById('btn-quick-new-branch')?.addEventListener('click', () => openBranchModal());
  document.getElementById('btn-abrir-nova-filial')?.addEventListener('click', () => openBranchModal());
  document.getElementById('btn-abrir-novo-depto')?.addEventListener('click', () => openModal('modal-dept'));
  document.getElementById('btn-abrir-novo-feriado')?.addEventListener('click', () => openHolidayModal());

  // Exportações
  document.getElementById('btn-export-matrix-csv')?.addEventListener('click', exportMatrixCSV);
  document.getElementById('btn-export-va-csv')?.addEventListener('click', exportVACSV);
  document.getElementById('btn-print-va')?.addEventListener('click', () => window.print());

  // Inicialização dos eventos da Central de Importação / Processamento NGPonto
  initImportacaoEvents();

  // Rolagem única do Dashboard de Ponto
  initMatrixUnifiedScroll();
}

async function monitorarStatusMotorLocal() {
  const badge = document.getElementById('motor-status-badge');
  const txt = document.getElementById('motor-status-text');
  if (!badge) return;

  const isHttps = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';

  try {
    const res = await fetch(`${API_BASE}/api/status`, { cache: 'no-store' }).then(r => r.json());
    if (res && res.ok) {
      badge.style.background = 'rgba(16, 185, 129, 0.15)';
      badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      badge.style.color = '#10b981';
      const dot = badge.querySelector('.cloud-dot');
      if (dot) { dot.style.background = '#10b981'; dot.style.boxShadow = '0 0 8px #10b981'; }
      if (txt) txt.textContent = isHttps ? 'Ponte Cloud Ativa' : 'Motor Local 3050';
      badge.title = `Motor DP Ativo: ${res.empresas?.length || 2} empresas, 4 relógios configurados.`;
    } else {
      throw new Error(res?.erro || 'Status não ok');
    }
  } catch (e) {
    badge.style.background = 'rgba(239, 68, 68, 0.15)';
    badge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    badge.style.color = '#ef4444';
    const dot = badge.querySelector('.cloud-dot');
    if (dot) { dot.style.background = '#ef4444'; dot.style.boxShadow = 'none'; }
    if (txt) txt.textContent = 'Motor Offline';
    badge.title = 'Motor local não respondeu. Verifique se o servidor.js está em execução no DP.';
  }
}

// Inicialização Geral ao Carregar a Página
document.addEventListener('DOMContentLoaded', () => {
  try { initTheme(); } catch (e) { console.warn('initTheme error:', e); }
  try { localStorage.removeItem('ponto_app_backup_history'); } catch (e) {}

  // 1. Inicializa navegação e eventos primeiro com segurança absoluta
  try { setupNavigation(); } catch (e) { console.error('setupNavigation error:', e); }
  try { initEvents(); } catch (e) { console.error('initEvents error:', e); }

  // 2. Carrega estado do storage e hidrata do servidor local
  try { loadStateFromStorage(); } catch (e) { console.error('loadStateFromStorage error:', e); }
  try { carregarEstadoDoServidorLocal(); } catch (e) {}
  try { checkModalDraftOnLoad(); } catch (e) {}

  // 3. Restaurar estado visual inicial
  if (appState.focusMode) {
    document.getElementById('focus-toggle-btn')?.classList.add('active');
  }
  if (document.getElementById('sort-select')) {
    document.getElementById('sort-select').value = appState.sortBy;
  }
  if (document.getElementById('filter-status-select')) {
    document.getElementById('filter-status-select').value = appState.statusFilter || 'ativos';
  }
  if (document.getElementById('filter-dept-select')) {
    document.getElementById('filter-dept-select').value = appState.departmentFilter || 'todos';
  }
  if (document.getElementById('search-filter-input')) {
    document.getElementById('search-filter-input').value = appState.searchFilter || '';
  }

  // 4. Determina tela inicial salva ou padrão (view-ponto)
  let initialView = 'view-ponto';
  try {
    const saved = localStorage.getItem('ponto_app_last_active_view');
    if (saved && document.getElementById(saved)) {
      initialView = saved;
    }
  } catch (e) {}
  appState.activeView = initialView;
  updateNavTabsActive(initialView);

  try {
    renderCurrentView();
  } catch (e) {
    console.error('renderCurrentView error on startup:', e);
  }

  // Sincronização automática em segundo plano com a nuvem Supabase
  try { syncFromCloudOnStart(); } catch (e) {}
  try { initSupabaseRealtime(); } catch (e) {}
  try { monitorarStatusMotorLocal(); setInterval(monitorarStatusMotorLocal, 15000); } catch (e) {}

  // Atualização automática em segundo plano das escalas e dados via NGPonto
  setTimeout(() => {
    try { aplicarEscalasNGPontoParaTodos(false); } catch (e) {}
  }, 1200);
});

// Navegação pelo teclado na Matriz de Ponto (Setas Cima/Baixo/Esquerda/Direita e Enter)
document.addEventListener('keydown', (e) => {
  // Apenas opera se a visão ativa for a Matriz de Ponto (view-ponto)
  if (appState.activeView !== 'view-ponto') return;

  // Não intercepta se o usuário estiver digitando em campos de texto/select
  const activeTag = document.activeElement ? document.activeElement.tagName : '';
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;

  // Não intercepta se houver algum modal aberto na tela
  const openModal = document.querySelector('.modal-overlay.active');
  if (openModal) return;

  const validKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'];
  if (!validKeys.includes(e.key)) return;

  const employees = getFilteredAndSortedEmployees(true);
  if (!employees || employees.length === 0) return;

  const daysInMonth = getDaysInMonth(appState.currentYear, appState.currentMonth);

  // Inicializa caso ainda não haja seleção
  if (!selectedMatrixColabId) {
    selectedMatrixColabId = employees[0].id;
  }
  if (!selectedMatrixDate) {
    selectedMatrixDate = formatDateISO(appState.currentYear, appState.currentMonth, 1);
  }

  const currentColabIdx = employees.findIndex(c => c.id === selectedMatrixColabId);
  const currentDay = parseInt(selectedMatrixDate.split('-')[2], 10) || 1;

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    const newIdx = Math.max(0, (currentColabIdx === -1 ? 0 : currentColabIdx) - 1);
    applyMatrixSelection(employees[newIdx].id, selectedMatrixDate);
    scrollSelectedCellIntoView();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    const newIdx = Math.min(employees.length - 1, (currentColabIdx === -1 ? 0 : currentColabIdx) + 1);
    applyMatrixSelection(employees[newIdx].id, selectedMatrixDate);
    scrollSelectedCellIntoView();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    const newDay = Math.max(1, currentDay - 1);
    const newDate = formatDateISO(appState.currentYear, appState.currentMonth, newDay);
    applyMatrixSelection(selectedMatrixColabId, newDate);
    scrollSelectedCellIntoView();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    const newDay = Math.min(daysInMonth, currentDay + 1);
    const newDate = formatDateISO(appState.currentYear, appState.currentMonth, newDay);
    applyMatrixSelection(selectedMatrixColabId, newDate);
    scrollSelectedCellIntoView();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedMatrixColabId && selectedMatrixDate) {
      const cell = document.querySelector('.cell-ponto[data-colab-id="' + selectedMatrixColabId + '"][data-date="' + selectedMatrixDate + '"]');
      if (cell) {
        if (cell.dataset.holiday === '1' || isHoliday(selectedMatrixDate, appState.activeBranchId)) {
          const hObj = isHoliday(selectedMatrixDate, appState.activeBranchId);
          showToast('Feriados cadastrados (' + (hObj?.nome || 'Feriado') + ') não podem ser modificados pelo dashboard. Para alterar este dia, exclua o feriado no cadastro de feriados.', 'warning');
          return;
        }
        if (cell.dataset.sunday === '1') {
          showToast('Dias de descanso obrigatório (DSR / Folga) não permitem alteração manual.', 'info');
          return;
        }
        if (cell.dataset.disabled === '1') {
          showToast('Data anterior à admissão do colaborador.', 'warning');
          return;
        }
        if (cell.dataset.dismissed === '1') {
          showToast('Colaborador desligado nesta data.', 'warning');
          return;
        }
        openCellDetailModal(selectedMatrixColabId, selectedMatrixDate);
      }
    }
  }
});

function scrollSelectedCellIntoView(smooth = true) {
  const container = document.querySelector('.matrix-container');
  const cell = document.querySelector('.cell-ponto.cell-selected');
  if (!container || !cell) return;

  const containerRect = container.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();

  // Dimensões exatas das áreas fixas (sticky)
  // 1. Cabeçalho sticky no topo: 54px
  const headerHeight = 54;

  // 2. Colunas sticky na esquerda (col-dept + col-badge + col-name):
  const stickyColLeft = document.querySelector('.matrix-table thead th.col-name') || document.querySelector('.matrix-table tbody tr td.col-name');
  const leftFrozenWidth = stickyColLeft ? (stickyColLeft.getBoundingClientRect().right - containerRect.left) : 420;

  // 3. Coluna sticky na direita (col-dsr):
  const stickyColDsr = document.querySelector('.matrix-table thead th.col-dsr') || document.querySelector('.matrix-table tbody tr td.col-dsr');
  const rightFrozenWidth = stickyColDsr ? (containerRect.right - stickyColDsr.getBoundingClientRect().left) : 95;

  const margin = 18; // Margem de respiro para visibilidade agradável

  let scrollDeltaX = 0;
  let scrollDeltaY = 0;

  // Verificação Horizontal (Esquerda / Direita)
  if (cellRect.left < containerRect.left + leftFrozenWidth + margin) {
    scrollDeltaX = cellRect.left - (containerRect.left + leftFrozenWidth + margin);
  } else if (cellRect.right > containerRect.right - rightFrozenWidth - margin) {
    scrollDeltaX = cellRect.right - (containerRect.right - rightFrozenWidth - margin);
  }

  // Verificação Vertical (Cima / Baixo) considerando apenas a área VISÍVEL da matriz na janela
  const visibleBottom = Math.min(containerRect.bottom, window.innerHeight);
  if (cellRect.top < containerRect.top + headerHeight + margin) {
    scrollDeltaY = cellRect.top - (containerRect.top + headerHeight + margin);
  } else if (cellRect.bottom > visibleBottom - margin) {
    scrollDeltaY = cellRect.bottom - (visibleBottom - margin);
  }

  // Rolagem unificada: ao descer, primeiro a página sobe (header/filtros saem), depois a matriz
  if (scrollDeltaY > 0 && containerRect.top > 0) {
    const pageDelta = Math.min(scrollDeltaY, containerRect.top);
    window.scrollBy({ top: pageDelta, behavior: smooth ? 'smooth' : 'auto' });
    scrollDeltaY -= pageDelta;
  }

  if (scrollDeltaX !== 0 || scrollDeltaY !== 0) {
    container.scrollBy({
      left: scrollDeltaX,
      top: scrollDeltaY,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }
}

/**
 * ROLAGEM ÚNICA DO DASHBOARD DE PONTO
 * - Rolando para BAIXO: primeiro a página rola (header e filtros saem da tela) até a matriz
 *   encostar no topo; a partir daí a rolagem continua nos funcionários até o final.
 * - Rolando para CIMA: primeiro passam todos os funcionários; só quando a lista chega ao topo
 *   o filtro e o cabeçalho voltam a aparecer.
 * O cabeçalho dos dias (e Departamento / Crachá / Colaborador / Qtd. DSR) fica sempre fixo.
 */
function initMatrixUnifiedScroll() {
  const container = document.getElementById('matrix-scroll-wrapper');
  if (!container || container.dataset.unifiedScroll === '1') return;
  container.dataset.unifiedScroll = '1';

  container.addEventListener('wheel', (e) => {
    if (appState.activeView !== 'view-ponto') return;
    if (e.ctrlKey) return; // zoom do navegador
    if (e.shiftKey) return; // Shift + roda = rolagem horizontal nativa
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // gesto horizontal (touchpad)

    let dy = e.deltaY;
    if (!dy) return;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= window.innerHeight;

    const doc = document.scrollingElement || document.documentElement;
    const pageMax = doc.scrollHeight - window.innerHeight;
    const pageY = window.scrollY || doc.scrollTop || 0;
    const containerTop = container.getBoundingClientRect().top;

    if (dy > 0) {
      // Descendo: a página rola primeiro até a matriz ocupar a tela inteira
      if (containerTop > 0.5 && pageY < pageMax - 0.5) {
        e.preventDefault();
        window.scrollBy(0, Math.min(dy, containerTop));
      }
    } else {
      // Subindo: primeiro os funcionários; no topo da lista, a página volta a mostrar os filtros
      if (container.scrollTop <= 0 && pageY > 0) {
        e.preventDefault();
        window.scrollBy(0, dy);
      }
    }
  }, { passive: false });
}

/**
 * ATALHOS DE TECLADO DOS MODAIS
 * - Esc: fecha o modal do topo SEM salvar.
 * - Enter: salva e fecha (Detalhe do Dia, OK em massa, Férias) / fecha (Detalhamento de DSR).
 * Registrado em fase de captura para rodar antes da navegação por teclado da matriz.
 */
const MODAL_ENTER_ACTIONS = {
  'modal-cell-detail': () => document.getElementById('btn-save-cell-detail')?.click(),
  'modal-mass-override': () => document.getElementById('btn-confirm-mass-ok')?.click(),
  'modal-dsr-details': () => closeModal('modal-dsr-details'),
  'modal-ferias': () => document.getElementById('btn-save-ferias')?.click()
};

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' && e.key !== 'Enter') return;
  const activeModals = Array.from(document.querySelectorAll('.modal-overlay.active'));
  if (activeModals.length === 0) return;
  const topModal = activeModals[activeModals.length - 1];

  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeModal(topModal.id);
    return;
  }

  const action = MODAL_ENTER_ACTIONS[topModal.id];
  if (!action) return;
  if (e.repeat || e.isComposing) return;
  if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;

  e.preventDefault();
  e.stopPropagation();
  action();
}, true);

// ==========================================================================
// 12. CENTRAL DE IMPORTAÇÃO, COLETA DOS 4 RELÓGIOS & PROCESSAMENTO NGPONTO
// ==========================================================================

const DESTINATARIOS_FILIAIS_PADRAO = {
  'Produção - Depósito I (7452)': {
    to: 'wallyson.euros@gmail.com',
    cc: 'contabilidade.euros@gmail.com, luciana.euros@gmail.com'
  },
  'Ind. Naviraí - MS (7452)': {
    to: 'rh.ms@euros.ind.br',
    cc: 'contabilidade.euros@gmail.com, fabio.euros@gmail.com'
  },
  'Relógio Caiari (6716)': {
    to: 'auxiliaradm@caiari.com',
    cc: 'contabilidade.euros@gmail.com'
  },
  'ADM Ji-Paraná (7452)': {
    to: '',
    cc: ''
  },
  'TODOS': {
    to: 'wallyson.euros@gmail.com, rh.ms@euros.ind.br, auxiliaradm@caiari.com',
    cc: 'contabilidade.euros@gmail.com'
  }
};

const DEFAULT_RELOGIOS_VINCULOS = {"relogio1_producao":[{"cod":218,"nome":"MARCOS BATISTA GONCALVES","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":1764},{"cod":234,"nome":"GILMAR SABINO DA SILVA","cargo":"OPERADOR DE EMPILHADEIRA II","idowner":7452,"idregistro":1792},{"cod":491,"nome":"GILMAR OTERIO DA SILVA DACOL","cargo":"CONFERENTE DE CARGA E DESCARGA II","idowner":7452,"idregistro":3188},{"cod":545,"nome":"ANTONIO BRITO SANTOS","cargo":"Operador de Expedição","idowner":7452,"idregistro":3264},{"cod":668,"nome":"JURANDI CAETANO SOARES","cargo":"OPERADOR DE MAQUINAS I","idowner":7452,"idregistro":4461},{"cod":701,"nome":"ANTONIO GOMES COELHO","cargo":"OPERADOR DE MAQUINAS II","idowner":7452,"idregistro":4515},{"cod":736,"nome":"EDINEIA CELIA DOS SANTOS","cargo":"ZELADORA","idowner":7452,"idregistro":5564},{"cod":847,"nome":"HEBER LUCAS LEONEL FONESI","cargo":"OPERADOR DE MAQUINAS II","idowner":7452,"idregistro":5702},{"cod":863,"nome":"KELVY ALVES COELHO","cargo":"OPERADOR DE MAQUINAS II","idowner":7452,"idregistro":5719},{"cod":955,"nome":"JOSE LUIZ DA SILVA","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":5861},{"cod":961,"nome":"LEONARDO VIEIRA DOS SANTOS","cargo":"OPERADOR DE MAQUINAS I","idowner":7452,"idregistro":5870},{"cod":970,"nome":"ANTONIO ALVES DE SOUZA","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":5880},{"cod":975,"nome":"EDUARDO DE OLIVEIRA SILVA","cargo":"CONFERENTE DE CARGA E DESCARGA I","idowner":7452,"idregistro":5886},{"cod":997,"nome":"PATRICIA BARROSO PINHEIRO","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":5917},{"cod":999,"nome":"JOSEFA JANAINA RODRIGUES DE SOUZA","cargo":"OPERADOR DE MAQUINAS I","idowner":7452,"idregistro":5919},{"cod":1008,"nome":"BRUNO PHELIPE VICENTE MACHADO","cargo":"Mecânico de Manutenção de Máquinas Industriais II","idowner":7452,"idregistro":5933},{"cod":1013,"nome":"RIQUELME ALMEIDA PINHEIRO","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":5941},{"cod":1018,"nome":"LEONARDO SILVA KIKO","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":5948},{"cod":1026,"nome":"IAN VINICIUS NERES LEITE","cargo":"ASSISTENTE DE ADMINISTRAÇÃO APRENDIZ","idowner":7452,"idregistro":5960},{"cod":1033,"nome":"PEDRO HENRIQUE DAMASCENO MELO","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":5968},{"cod":1034,"nome":"WESLEY PATRICK FERNANDES DE OLIVEIRA","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":5969},{"cod":1036,"nome":"JOAO VITOR MAGALHAES LEAO","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":5971},{"cod":1037,"nome":"WESLEY RIBEIRO SANTIAGO","cargo":"SOLDADOR","idowner":7452,"idregistro":5973},{"cod":1038,"nome":"EDSON FERREIRA MOTA JUNIOR","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":5974}],"relogio2_adm":[{"cod":1,"nome":"DICEFANI MACEDO FERRARINI","cargo":"AUXILIAR ADMINISTRATIVO","idowner":7452,"idregistro":1361},{"cod":354,"nome":"JOSE MARIA ALVES DA CRUZ","cargo":"SOLDADOR","idowner":7452,"idregistro":1981},{"cod":361,"nome":"FERNANDA CRISTINA PAIXAO DE ALMEIDA","cargo":"AUXILIAR FINANCEIRO III","idowner":7452,"idregistro":1989},{"cod":463,"nome":"FABIO FARIAS","cargo":"GERENTE DE PRODUÇÃO","idowner":7452,"idregistro":3143},{"cod":663,"nome":"DEVAIR DUARTE SANCHES","cargo":"Supervisores em Manutenção","idowner":7452,"idregistro":4454},{"cod":778,"nome":"ANGELICA DA SILVA GAMA","cargo":"OPERADOR DE MAQUINAS II","idowner":7452,"idregistro":5615},{"cod":858,"nome":"LUCIANA GUIMARÃES DOS SANTOS","cargo":"GERENTE DE PRODUÇÃO","idowner":7452,"idregistro":5714},{"cod":900,"nome":"JANAINA CARDOSO DA SILVA","cargo":"AUXILIAR ADMINISTRATIVO I","idowner":7452,"idregistro":5763},{"cod":908,"nome":"ADRIANA DE SOUZA","cargo":"ASSISTENTE CONTABIL","idowner":7452,"idregistro":5779},{"cod":914,"nome":"DANILO NATA DA SILVA SANTOS","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":5788},{"cod":917,"nome":"PATRICIA MARTINS BENEDITO","cargo":"AUXILIAR FINANCEIRO I","idowner":7452,"idregistro":5793},{"cod":942,"nome":"USIEL OLIVEIRA","cargo":"ASSISTENTE DE DEPARTAMENTO PESSOAL","idowner":7452,"idregistro":5826},{"cod":954,"nome":"WALLYSON PEREIRA DE MELO","cargo":"SUPERVISOR PRODUÇÃO","idowner":7452,"idregistro":5858},{"cod":963,"nome":"KELIANE GONCALVES DE SOUZA","cargo":"AXILIAR CONTABIL","idowner":7452,"idregistro":5871},{"cod":989,"nome":"LUCAS DOS SANTOS ABREU","cargo":"AUXILIAR ADMINISTRATIVO II","idowner":7452,"idregistro":5907},{"cod":1000,"nome":"LUCAS VILAS BOAS BRITO","cargo":"AUXILIAR DE DEPARTAMENTO PESSOAL","idowner":7452,"idregistro":5921},{"cod":1039,"nome":"DANIELA DINIZ DA COSTA","cargo":"Auxiliar de Faturamento","idowner":7452,"idregistro":5975},{"cod":1040,"nome":"FRANCISMAR SOUZA DA SILVA","cargo":"SUPERVISOR PRODUÇÃO","idowner":7452,"idregistro":5976},{"cod":1173,"nome":"LUANA CAMILO DE MORAES","cargo":"AUXILIAR DE CONTROLE INTERNO","idowner":7452,"idregistro":5816},{"cod":1405,"nome":"LUCAS TUPAN DA SILVA","cargo":"ASSISTENTE CONTABIL","idowner":7452,"idregistro":5818}],"relogio3_navirai":[{"cod":127,"nome":"LEONICE DA SILVA MOURA DE SOUZA","cargo":"OPERADOR DE MAQUINAS II","idowner":7452,"idregistro":1619},{"cod":288,"nome":"SERGIO RIBEIRO","cargo":"MOTORISTA II","idowner":7452,"idregistro":1884},{"cod":456,"nome":"PAULO SERGIO FERREIRA DA SILVA","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":3135},{"cod":561,"nome":"LUCAS DE PAULA CARVALHO","cargo":"OPERADOR DE EMPILHADEIRA I","idowner":7452,"idregistro":3291},{"cod":613,"nome":"MARCO ANTONIO OLIVEIRA DE SOUZA","cargo":"OPERADOR DE MAQUINAS III","idowner":7452,"idregistro":4368},{"cod":780,"nome":"LEONARDO MARINHO CARIS","cargo":"OPERADOR DE MAQUINAS I","idowner":7452,"idregistro":5617},{"cod":810,"nome":"ROSANA SANABRIA FERREIRA DA SILVA","cargo":"ZELADORA","idowner":7452,"idregistro":5657},{"cod":867,"nome":"APARICIO AMARILLA","cargo":"MOTORISTA I","idowner":7452,"idregistro":5723},{"cod":946,"nome":"EVELYN GABRIELE HARADA MANDUCO PRIORI","cargo":"AUXILIAR FINANCEIRO","idowner":7452,"idregistro":5848},{"cod":952,"nome":"ROBSON DA SILVA LUIZ","cargo":"VENDEDOR VAREJISTA","idowner":7452,"idregistro":5856},{"cod":964,"nome":"WELLINGTON MARCELINO DOS SANTOS","cargo":"SUPERVISOR PRODUÇÃO","idowner":7452,"idregistro":5874},{"cod":977,"nome":"PAULO HENRIQUE CARVALHO BENTO","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":5890},{"cod":993,"nome":"PAULO LIMA DA SILVA","cargo":"AUXILIAR DE PRODUÇÃO","idowner":7452,"idregistro":5913},{"cod":994,"nome":"TAMIRES TONINI DE MORAES","cargo":"AUXILIAR FINANCEIRO","idowner":7452,"idregistro":5914},{"cod":1009,"nome":"MARTA APARECIDA DE SOUZA","cargo":"SOLDADOR","idowner":7452,"idregistro":5934},{"cod":1016,"nome":"GUILHERME ANTONIO DOS SANTOS","cargo":"Técnico em Planejamento e controle da produção - Apredíz","idowner":7452,"idregistro":5946}],"relogio4_caiari":[{"cod":1,"nome":"SILVANA MARIA MOREIRA FERRARINI","cargo":"GERENTE ADM. E FINANCEIRO","idowner":6716,"idregistro":1112},{"cod":2,"nome":"MARCELO ROQUE DE OLIVEIRA","cargo":"CONTADOR","idowner":6716,"idregistro":1113},{"cod":29,"nome":"WALDENIR ANTONIO TRAMONTINA GRAVENA","cargo":"MOTORISTA DE FURGAO OU VEICULO SIMILAR","idowner":6716,"idregistro":1138},{"cod":57,"nome":"JOSE IREMAR DOS SANTOS ALVES","cargo":"CONFERENTE DE CARGA E DESCARGA","idowner":6716,"idregistro":1166},{"cod":184,"nome":"ROBERTO MARQUES DE SOUZA","cargo":"ENGENHEIRO AMBIENTAL","idowner":6716,"idregistro":1966},{"cod":234,"nome":"BRUNO WINICIUS DE SOUZA","cargo":"VENDEDOR NO COMERCIO VAREJISTA","idowner":6716,"idregistro":4433},{"cod":241,"nome":"JHELKISSAN WOLKYN BARBOSA RUEDA","cargo":"AUXILIAR ADMINISTRATIVO","idowner":6716,"idregistro":4440},{"cod":249,"nome":"RAIMUNDO MONTEIRO DE ARAUJO MELO","cargo":"VENDEDOR NO COMERCIO VAREJISTA","idowner":6716,"idregistro":4448},{"cod":250,"nome":"RONALDO DE ASSIS MELO","cargo":"ENCARREGADO DE DEPOSITO","idowner":6716,"idregistro":4449},{"cod":255,"nome":"NILZA MARTINS DOS SANTOS","cargo":"ZELADORA","idowner":6716,"idregistro":4459},{"cod":256,"nome":"DAVID JOSE NOGUEIRA DE SOUZA","cargo":"VENDEDOR NO COMERCIO VAREJISTA","idowner":6716,"idregistro":4460},{"cod":294,"nome":"MALALIEL RODRIGUES","cargo":"MOTORISTA DE FURGAO OU VEICULO SIMILAR","idowner":6716,"idregistro":5637},{"cod":295,"nome":"GABRIEL FELIPE DOS SANTOS","cargo":"VENDEDOR NO COMERCIO VAREJISTA","idowner":6716,"idregistro":5638},{"cod":313,"nome":"JHENIFER LOPES FERREIRA","cargo":"VENDEDOR NO COMERCIO VAREJISTA","idowner":6716,"idregistro":5746},{"cod":335,"nome":"ADEMILSON MARCELO VILETE","cargo":"CONFERENTE DE CARGA E DESCARGA","idowner":6716,"idregistro":5815},{"cod":336,"nome":"JHONATAN JULIO DA SILVA REIS","cargo":"Aux. de Deposito","idowner":6716,"idregistro":5830},{"cod":343,"nome":"GUILHERME HENRIQUE MELO COUTINHO","cargo":"VENDEDOR NO COMERCIO VAREJISTA","idowner":6716,"idregistro":5872},{"cod":344,"nome":"WEVERTON SEBASTIAO FIGUEIREDO SOUZA","cargo":"MOTORISTA DE FURGAO OU VEICULO SIMILAR","idowner":6716,"idregistro":5884},{"cod":350,"nome":"GABRIEL BARBOSA LOPES","cargo":"Aux. de Deposito","idowner":6716,"idregistro":5905},{"cod":356,"nome":"FABIANA RODRIGUES DE JESUS","cargo":"AUXILIAR FINANCEIRO","idowner":6716,"idregistro":5932},{"cod":358,"nome":"MELQUISEDEQUE ABRANJO DE OLIVEIRA","cargo":"AUXILIAR DE ESTOQUE","idowner":6716,"idregistro":5938},{"cod":360,"nome":"ISABELA VIDAL MARTINS","cargo":"AUXILIAR FINANCEIRO","idowner":6716,"idregistro":5944},{"cod":361,"nome":"MAYCK CANDIDO DE JESUS","cargo":"AUXILIAR DE ESTOQUE","idowner":6716,"idregistro":5949},{"cod":363,"nome":"EMILLYN KAROLYNY GARCIA DE OLIVEIRA","cargo":"ASSISTENTE ADMINISTRATIVO - APRENDIZ","idowner":6716,"idregistro":5952},{"cod":364,"nome":"NARA LORENA PEREIRA RODRIGUES DA SILVA","cargo":"AUXILIAR FINANCEIRO","idowner":6716,"idregistro":5955},{"cod":365,"nome":"LEONARDO DE SOUZA SANTOS","cargo":"Aux. de Deposito","idowner":6716,"idregistro":5963},{"cod":366,"nome":"ALINE DA SILVA","cargo":"AUXILIAR FINANCEIRO","idowner":6716,"idregistro":5972}],"folha_manual":[{"cod":325,"nome":"JORGE LUIZ DE ANDRADE","cargo":"PORTEIRO","idowner":7452,"idregistro":1942},{"cod":336,"nome":"CLAUDINEI RIBEIRO FERNANDES","cargo":"VENDEDOR ATACADISTA","idowner":7452,"idregistro":1959},{"cod":431,"nome":"RONALDO RIBEIRO DE ARAUJO","cargo":"VIGIA","idowner":7452,"idregistro":3098},{"cod":540,"nome":"LEONILDO TABORDA BARBOSA","cargo":"MOTORISTA II","idowner":7452,"idregistro":3256},{"cod":696,"nome":"ANTONIO DA SILVA","cargo":"VIGIA","idowner":7452,"idregistro":4502},{"cod":702,"nome":"BRUNO RIBEIRO DA SILVA","cargo":"VENDEDOR ATACADISTA","idowner":7452,"idregistro":4516},{"cod":781,"nome":"RAFAEL DE JESUS CARDOSO","cargo":"VENDEDOR","idowner":7452,"idregistro":5618},{"cod":898,"nome":"JOSÉ PAULO DO NASCIMENTO","cargo":"MOTORISTA II","idowner":7452,"idregistro":5761},{"cod":937,"nome":"HUGO HENRIQUE CIONI","cargo":"VENDEDOR","idowner":7452,"idregistro":5821},{"cod":965,"nome":"LEANDRO MARTINS DO NASCIMENTO","cargo":"PORTEIRO","idowner":7452,"idregistro":5875},{"cod":974,"nome":"EUCLIDES NUNES DOS SANTOS","cargo":"MOTORISTA I","idowner":7452,"idregistro":5885},{"cod":1020,"nome":"CARLOS HENRIQUE ANGELICO","cargo":"VENDEDOR","idowner":7452,"idregistro":5953},{"cod":1027,"nome":"VANDEILSON DIAS DE MATOS","cargo":"MOTORISTA I","idowner":7452,"idregistro":5961},{"cod":1031,"nome":"IRACI EVANGELISTA DOS SANTOS","cargo":"ZELADORA","idowner":7452,"idregistro":5966},{"cod":1032,"nome":"RAUL FERNANDO MENEGUETTI JACOB","cargo":"MOTORISTA I","idowner":7452,"idregistro":5967}],"isentos":[{"cod":103,"nome":"FELIPE AUGUSTO GALVÃO DO NASCIMENTO","cargo":"ENGENHEIRO AMBIENTAL","idowner":7452,"idregistro":1579},{"cod":131,"nome":"LUANA DE OLIVEIRA E SILVA","cargo":"ENGENHEIRO AMBIENTAL","idowner":7452,"idregistro":1624},{"cod":231,"nome":"CARINA STRE HOLANDA","cargo":"ENGENHEIRO AMBIENTAL","idowner":7452,"idregistro":1787},{"cod":233,"nome":"DIEGO GARCIA GALVAO COSTA","cargo":"ARQUITETO","idowner":7452,"idregistro":1790},{"cod":341,"nome":"ARTUR GUILHERME RODRIGUES TROMBETI","cargo":"ADVOGADO","idowner":7452,"idregistro":1964},{"cod":342,"nome":"ROBERTO MARQUES DE SOUZA","cargo":"ENGENHEIRO AMBIENTAL","idowner":7452,"idregistro":1965},{"cod":425,"nome":"VICENTE FELIZARI FILHO","cargo":"ADVOGADO","idowner":7452,"idregistro":2088},{"cod":568,"nome":"FÁBIO PINHEIRO BRAGA","cargo":"ARQUITETO","idowner":7452,"idregistro":3305},{"cod":588,"nome":"FRANCISCO AIRAO DE ARAUJO","cargo":"ENGENHEIRO AMBIENTAL","idowner":7452,"idregistro":3333},{"cod":611,"nome":"HELIO APARECIDO FERREIRA","cargo":"Mecânicos de manutenção de veículos automotores","idowner":7452,"idregistro":4365},{"cod":614,"nome":"RENAN PIRES MACIEL","cargo":"OPERADOR DE MAQUINAS PESADAS","idowner":7452,"idregistro":4369},{"cod":625,"nome":"Caroline Horana Luiz Pinheiro","cargo":"ENGENHEIRO AMBIENTAL","idowner":7452,"idregistro":4385},{"cod":626,"nome":"CLEOMAR FERREIRA ALVES","cargo":"JARDINEIRO","idowner":7452,"idregistro":4386},{"cod":628,"nome":"ERIKSOM DE JESUS ALENCASTRO","cargo":"Eletricista","idowner":7452,"idregistro":4389},{"cod":641,"nome":"FRANCISCO SILVA","cargo":"PEDREIRO","idowner":7452,"idregistro":4407},{"cod":660,"nome":"Adalmir Gomes de Almeida","cargo":"PEDREIRO","idowner":7452,"idregistro":4429},{"cod":673,"nome":"RICARDO ALMEIDA DE ANDRADE","cargo":"ADVOGADO","idowner":7452,"idregistro":4469},{"cod":678,"nome":"VANESSA OLIVEIRA DE FARIA RODRIGUES","cargo":"Personal treanning","idowner":7452,"idregistro":4477},{"cod":903,"nome":"RENAN SANTANA DO NASCIMENTO","cargo":"PEDREIRO","idowner":7452,"idregistro":5769}]};

let impState = {
  activeSubtab: 'subtab-coleta',
  relogios: [],
  vinculos: DEFAULT_RELOGIOS_VINCULOS,
  pendenciasCache: null,
  filtroVinculo: 'TODOS',
  buscaVinculo: ''
};


/**
 * Coleta e Processa um ÚNICO relógio específico (Etapa 1 a 4)
 * @param {number} etapa 1=Depósito I, 2=ADM Ji-Paraná, 3=Naviraí MS, 4=Caiari
 */
async function coletarEProcessarRelogioApp(etapa) {
  etapa = parseInt(etapa, 10);
  if (!etapa || etapa < 1 || etapa > 4) {
    showToast('Selecione um relógio válido (Etapa 1 a 4).', 'warning');
    return;
  }
  const nomes = {
    1: 'Relógio 1: Produção Depósito I (Ji-Paraná)',
    2: 'Relógio 2: ADM Ji-Paraná',
    3: 'Relógio 3: Ind. Naviraí MS',
    4: 'Relógio 4: Caiari'
  };
  const nomeRel = nomes[etapa] || `Relógio Etapa ${etapa}`;
  const idowner = etapa === 4 ? 6716 : 7452;
  const nomeEmpresa = etapa === 4 ? 'Caiari (6716)' : 'Euros Aço (7452)';

  showToast(`📡 [1/3] Conectando e coletando batidas do ${nomeRel}...`);
  try {
    const inicio = document.getElementById('app-relInicio')?.value || '';
    const fim = document.getElementById('app-relFim')?.value || '';
    const nsr = document.getElementById('app-relNsr')?.value || '';

    const resColeta = await fetch(`${API_BASE}/api/coletar-relogios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etapa, inicio, fim, nsr })
    }).then(r => r.json());

    if (!resColeta || !resColeta.ok) {
      showToast('Erro na coleta do relógio: ' + (resColeta?.erro || 'Falha de comunicação'), 'error');
      return;
    }

    const box = document.getElementById('app-logRelogiosBox');
    const txt = document.getElementById('app-logRelogiosTexto');
    if (box) box.style.display = 'block';
    if (txt && resColeta.resultados) {
      txt.textContent = resColeta.resultados.map(x =>
        x.ok
          ? `✅ [Etapa ${x.etapa}] ${x.relogio} (${x.empresa})\n   NSR: ${x.nsrInicial} até ${x.nsrAtual} | Batidas coletadas: ${x.batidasLidasRelogio} | Colaboradores Vinculados: ${x.colaboradoresVinculados}`
          : `❌ [Etapa ${x.etapa}] ${x.relogio}: ${x.erro}`
      ).join('\n\n');
    }

    showToast(`⚡ [2/3] Processando marcações no NGPonto para ${nomeEmpresa}...`);
    const mes = appState.currentMonth + 1;
    const ano = appState.currentYear;

    const resProc = await fetch(`${API_BASE}/api/processar-duplo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idowner, mes, ano })
    }).then(r => r.json());

    if (resProc && resProc.ok) {
      await carregarPendenciasRelatorioApp(true);
      await carregarStatusRelogiosApp();
      showToast(`✅ ${nomeRel} coletado, processado e integrado com sucesso!`);
    } else {
      showToast('Coleta concluída, mas erro ao processar: ' + (resProc?.erro || 'Erro no NGPonto'), 'warning');
    }
  } catch (e) {
    showToast(formatMotorErrorMessage(e, 'Erro na operação do relógio'), 'error');
  }
}

function initImportacaoEvents() {
  // Alternância das 3 Sub-abas da Central
  document.querySelectorAll('.imp-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.subtab;
      impState.activeSubtab = target;
      document.querySelectorAll('.imp-subtab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.imp-subtab-panel').forEach(p => p.style.display = (p.id === target ? 'block' : 'none'));
      if (target === 'subtab-relatorio') carregarPendenciasRelatorioApp();
      if (target === 'subtab-vinculos') carregarVinculosRelogiosApp();
    });
  });

  // Toolbar Coleta & Processamento
  document.getElementById('btn-imp-calcular-datas')?.addEventListener('click', () => calcularDatasRelogioApp());
  document.getElementById('btn-imp-ler-nsr')?.addEventListener('click', () => carregarStatusRelogiosApp(true));
  document.getElementById('btn-imp-coletar-todos')?.addEventListener('click', () => coletarRelogioApp(0));
  document.getElementById('btn-imp-processar-duplo')?.addEventListener('click', () => processarDuploApp());
  document.getElementById('btn-imp-rotina-matinal')?.addEventListener('click', () => executarRotinaMatinalApp());
  
  // Ações para Relógio Específico Selecionado
  document.getElementById('btn-imp-coletar-especifico')?.addEventListener('click', () => {
    const sel = document.getElementById('select-imp-relogio-especifico');
    const etapa = sel ? parseInt(sel.value, 10) : 1;
    coletarRelogioApp(etapa);
  });
  document.getElementById('btn-imp-processar-especifico')?.addEventListener('click', () => {
    const sel = document.getElementById('select-imp-relogio-especifico');
    const etapa = sel ? parseInt(sel.value, 10) : 1;
    coletarEProcessarRelogioApp(etapa);
  });
  document.getElementById('btn-imp-sincronizar-matriz')?.addEventListener('click', () => sincronizarBatidasNGParaMatriz());
  document.getElementById('btn-app-limpar-log')?.addEventListener('click', () => {
    const box = document.getElementById('app-logRelogiosBox');
    const txt = document.getElementById('app-logRelogiosTexto');
    if (txt) txt.textContent = '';
    if (box) box.style.display = 'none';
  });

  // Subtab 2: Relatório & E-mail Diário
  document.getElementById('btn-app-atualizar-relatorio-email')?.addEventListener('click', () => carregarPendenciasRelatorioApp(true));
  document.getElementById('email-filial-select')?.addEventListener('change', () => atualizarTextoEmailApp());
  document.getElementById('email-dia-ref')?.addEventListener('input', () => atualizarTextoEmailApp());
  document.getElementById('btn-email-data-ontem')?.addEventListener('click', () => definirDataEmailRelativaApp(-1));
  document.getElementById('btn-email-data-hoje')?.addEventListener('click', () => definirDataEmailRelativaApp(0));
  document.getElementById('btn-email-data-ant')?.addEventListener('click', () => definirDataEmailRelativaApp(-2));
  document.getElementById('btn-app-abrir-gmail')?.addEventListener('click', () => abrirGmailApp());
  document.getElementById('btn-app-abrir-whatsapp')?.addEventListener('click', () => abrirWhatsAppApp());
  document.getElementById('btn-app-copiar-email')?.addEventListener('click', () => copiarTextoEmailApp());
  document.getElementById('btn-app-salvar-destinatarios')?.addEventListener('click', () => salvarDestinatariosApp());

  // Subtab 3: Vínculos de Relógios
  document.getElementById('busca-vinculo-colab')?.addEventListener('input', (e) => {
    impState.buscaVinculo = e.target.value.toLowerCase().trim();
    renderRelogiosVinculosTable();
  });
  document.getElementById('filtro-vinculo-categoria')?.addEventListener('change', (e) => {
    impState.filtroVinculo = e.target.value;
    renderRelogiosVinculosTable();
  });
  document.getElementById('btn-salvar-vinculos-relogios')?.addEventListener('click', () => salvarVinculosRelogiosApp());

  // Ações nos Modais: Detalhe do Dia (Cell)
  document.getElementById('btn-preencher-previsto-cell')?.addEventListener('click', () => {
    if (!currentEditingCell || !currentEditingCell.quadroDia) {
      showToast('Nenhum horário previsto encontrado para este dia.', 'warning');
      return;
    }
    const q = currentEditingCell.quadroDia;
    const emInput = document.getElementById('punch-em');
    const smInput = document.getElementById('punch-sm');
    const etInput = document.getElementById('punch-et');
    const stInput = document.getElementById('punch-st');
    if (emInput) emInput.value = q.e1 || '';
    if (smInput) smInput.value = q.s1 || '';
    if (etInput) etInput.value = q.e2 || '';
    if (stInput) stInput.value = q.s2 || '';

    const selSt = document.getElementById('select-override-status');
    if (selSt && selSt.value !== 'VAZIO') selSt.value = 'OK';
    const selSt2 = document.getElementById('select-override-status-2');
    if (selSt2) selSt2.value = '';

    const inMaior = document.getElementById('input-atraso-maior');
    const inPequeno = document.getElementById('input-atraso-pequeno');
    if (inMaior) inMaior.value = '';
    if (inPequeno) inPequeno.value = '';

    showToast('⚡ Horários previstos do quadro NGPonto preenchidos!', 'info');
  });

  document.getElementById('btn-puxar-ng-cell')?.addEventListener('click', async () => {
    const { colabId, isoDate } = currentEditingCell || {};
    if (!colabId || !isoDate) return;
    const colab = appState.colaboradores.find(c => c.id === colabId);
    if (!colab) return;

    showToast(`🔄 Consultando espelho de batidas do NGPonto para ${colab.nome}...`);
    try {
      const dt = new Date(isoDate + 'T12:00:00');
      const mes = dt.getMonth() + 1;
      const ano = dt.getFullYear();
      const idowner = colab.idowner || (colab.filialId === 'branch-3' ? 6716 : 7452);
      const idregistro = colab.idregistro || colab.idregistroNG || colab.cracha;

      const res = await fetch(`${API_BASE}/api/espelho?idowner=${idowner}&idregistro=${idregistro}&mes=${mes}&ano=${ano}`).then(r => r.json());
      if (res.ok && res.dias) {
        const dInfo = res.dias.find(d => d.dataIso === isoDate);
        if (dInfo && dInfo.batidas) {
          const b = dInfo.batidas;
          document.getElementById('punch-em').value = b[0] || '';
          document.getElementById('punch-sm').value = b[1] || '';
          document.getElementById('punch-et').value = b[2] || '';
          document.getElementById('punch-st').value = b[3] || '';
          if (dInfo.status && dInfo.status !== 'AUTO') {
            document.getElementById('select-override-status').value = dInfo.status;
          }
          const inMaior = document.getElementById('input-atraso-maior');
          if (inMaior) inMaior.value = (dInfo.atraso && dInfo.atraso !== '00:00') ? dInfo.atraso : '';
          if (dInfo.justificativa) {
            document.getElementById('input-cell-justificativa').value = dInfo.justificativa;
          }
          showToast(`✅ Batidas do NGPonto carregadas: ${b.join(', ') || 'Nenhuma batida'}`);
        } else {
          showToast('Nenhuma marcação encontrada no banco para esta data.', 'info');
        }
      } else {
        showToast('Não foi possível carregar do NGPonto: ' + (res.erro || 'Falha na resposta'), 'warning');
      }
    } catch (e) {
      showToast(formatMotorErrorMessage(e, 'Erro ao conectar ao motor NGPonto'), 'error');
    }
  });

  // Ações nos Modais: Funcionário (Buscar e Salvar+Puxar)
  document.getElementById('btn-emp-buscar-ng')?.addEventListener('click', () => buscarDadosNGPontoParaModalColab());
  document.getElementById('btn-save-and-sync-employee')?.addEventListener('click', async () => {
    const btnSave = document.getElementById('btn-save-employee');
    if (btnSave) btnSave.click();
    showToast('⚡ Cadastro salvo com sucesso!');
  });

  // Lookup automático de Crachá/Filial para o modal limpo de funcionário
  setupAutoLookupNGPonto();
  document.getElementById('btn-sincronizar-escalas-ng')?.addEventListener('click', () => aplicarEscalasNGPontoParaTodos(true));
}

function renderImportacaoView() {
  calcularDatasRelogioApp();
  if (impState.activeSubtab === 'subtab-coleta') {
    carregarStatusRelogiosApp();
  } else if (impState.activeSubtab === 'subtab-relatorio') {
    carregarPendenciasRelatorioApp();
  } else if (impState.activeSubtab === 'subtab-vinculos') {
    carregarVinculosRelogiosApp();
  }
}

function calcularDatasRelogioApp() {
  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  const dd = String(hoje.getDate()).padStart(2, '0');
  const sHoje = `${yyyy}-${mm}-${dd}`;

  // -1 dia útil (sábado é considerado dia útil na empresa)
  let d1 = new Date(hoje);
  d1.setDate(d1.getDate() - 1);
  if (d1.getDay() === 0) d1.setDate(d1.getDate() - 1);
  const s1 = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`;

  // -2 dias úteis
  let d2 = new Date(d1);
  d2.setDate(d2.getDate() - 1);
  if (d2.getDay() === 0) d2.setDate(d2.getDate() - 1);
  const s2 = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;

  const inIni = document.getElementById('app-relInicio');
  const inFim = document.getElementById('app-relFim');
  const inNsr = document.getElementById('app-relNsr');
  if (inIni && !inIni.value) inIni.value = s1;
  if (inFim && !inFim.value) inFim.value = sHoje;
  if (inNsr && !inNsr.value) inNsr.value = s2;
}

async function carregarStatusRelogiosApp(completo = false) {
  try {
    if (completo) showToast('🔍 Conectando aos 4 relógios Control iD via TCP/IP para ler os NSRs atuais...');
    const res = await fetch(`${API_BASE}/api/status${completo ? '?completo=1' : ''}`).then(r => r.json());
    if (res.ok && res.relogios) {
      impState.relogios = res.relogios;
      renderizarCardsRelogiosApp(res.relogios);
      if (completo) showToast('✅ NSRs e status dos 4 relógios lidos com sucesso!');
    }
  } catch (e) {
    console.warn('Erro ao carregar status dos relógios:', e);
  }
}

function renderizarCardsRelogiosApp(relogios) {
  const grid = document.getElementById('app-cardsRelogios');
  if (!grid) return;
  grid.innerHTML = (relogios || []).map(r => `
    <div class="relogio-card">
      <div>
        <div class="relogio-card-header">
          <div>
            <h4 class="relogio-card-title">${r.nome}</h4>
            <span class="relogio-card-sub">${r.empresaNome}</span>
          </div>
          <span class="badge ${r.online ? 'badge-success' : 'badge-danger'}" style="font-size:10.5px; padding:3px 8px; border-radius:12px; background:${r.online ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}; color:${r.online ? '#10B981' : '#EF4444'}; border:1px solid ${r.online ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'};">
            ${r.online ? '🟢 Online' : '🔴 Offline'}
          </span>
        </div>
        <div style="background:rgba(255,255,255,0.02); padding:8px 10px; border-radius:6px; margin-bottom:12px; border:1px solid rgba(255,255,255,0.05);">
          <div class="relogio-stat-row">
            <span class="relogio-stat-label">IP & Porta:</span>
            <span class="relogio-stat-val"><code>${r.ip}:${r.porta}</code></span>
          </div>
          <div class="relogio-stat-row">
            <span class="relogio-stat-label">NSR Atual no Relógio:</span>
            <span class="relogio-stat-val" style="color:var(--color-cyan);">${r.nsrAtual || 'N/D'}</span>
          </div>
          <div class="relogio-stat-row">
            <span class="relogio-stat-label">Último NSR Banco:</span>
            <span class="relogio-stat-val">${r.ultimoNsrBanco || 'N/D'}</span>
          </div>
          <div class="relogio-stat-row">
            <span class="relogio-stat-label">Última Batida Banco:</span>
            <span class="relogio-stat-val">${r.ultimaDataBanco || 'N/D'}</span>
          </div>
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-secondary btn-sm" style="flex:1; justify-content:center; font-weight:600; font-size:11px;" onclick="coletarRelogioApp(${r.etapa})" title="Coleta as batidas físicas no relógio sem processar cálculos">
          <span>📥</span> Coletar
        </button>
        <button class="btn btn-primary btn-sm" style="flex:1.4; justify-content:center; font-weight:700; font-size:11px; background:var(--color-primary); border-color:var(--color-primary);" onclick="coletarEProcessarRelogioApp(${r.etapa})" title="Coleta as batidas e roda o processamento duplo no NGPonto">
          <span>⚡</span> Coletar & Processar
        </button>
      </div>
    </div>
  `).join('');
}

async function coletarRelogioApp(etapa = 0) {
  const inicio = document.getElementById('app-relInicio')?.value || '';
  const fim = document.getElementById('app-relFim')?.value || '';
  const nsr = document.getElementById('app-relNsr')?.value || '';
  const autoProcessar = !!document.getElementById('app-chkProcessarAposColeta')?.checked;

  const descRelogio = etapa === 0 ? 'TODOS os 4 Relógios' : `Relógio Etapa ${etapa}`;
  showToast(`📡 [1/2] Conectando aos relógios via RepCid.dll e coletando ${descRelogio} (${inicio} a ${fim})... Aguarde.`);

  try {
    const res = await fetch(`${API_BASE}/api/coletar-relogios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etapa, inicio, fim, nsr })
    }).then(r => r.json());

    if (res.ok) {
      const box = document.getElementById('app-logRelogiosBox');
      const txt = document.getElementById('app-logRelogiosTexto');
      if (box) box.style.display = 'block';
      if (txt) {
        txt.textContent = res.resultados.map(x =>
          x.ok
            ? `✅ [Etapa ${x.etapa}] ${x.relogio} (${x.empresa})\n   NSR lido: ${x.nsrInicial} até ${x.nsrAtual} | Batidas coletadas: ${x.batidasLidasRelogio} | Colaboradores Vinculados: ${x.colaboradoresVinculados}`
            : `❌ [Etapa ${x.etapa}] ${x.relogio}: ${x.erro}`
        ).join('\n\n');
      }

      showToast('⚡ Coleta concluída com sucesso! Processando cálculos no NGPonto...');
      await processarDuploApp(false);
      await carregarPendenciasRelatorioApp(true);
      await carregarStatusRelogiosApp();
      showToast('🎉 Ponto coletado e apurado no NGPonto com sucesso!');
    } else {
      showToast('Erro na coleta: ' + res.erro, 'error');
    }
  } catch (e) {
    showToast(formatMotorErrorMessage(e, 'Erro ao comunicar com o motor de coleta'), 'error');
  }
}

async function processarDuploApp(comToast = true) {
  if (comToast) showToast('⚡ Processando marcações em 2 ciclos no NGPonto (Euros Aço 7452 e Caiari 6716)...');
  try {
    const mes = appState.currentMonth + 1;
    const ano = appState.currentYear;
    const res = await fetch(`${API_BASE}/api/processar-duplo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idowner: 0, mes, ano })
    }).then(r => r.json());

    if (res.ok) {
      showToast('🎉 Marcações processadas com sucesso em 2 ciclos no NGPonto!');
      await carregarPendenciasRelatorioApp(true);
      await carregarStatusRelogiosApp();
    } else {
      showToast('Erro no processamento: ' + res.erro, 'error');
    }
  } catch (e) {
    showToast(formatMotorErrorMessage(e, 'Erro ao processar marcações'), 'error');
  }
}

async function executarRotinaMatinalApp() {
  if (!confirm('Deseja executar a Rotina Matinal Completa do DP para os 4 RELÓGIOS?\n\n1. Coleta simultânea dos 4 relógios Control iD:\n   • Depósito I - Produção (192.168.0.121)\n   • ADM Ji-Paraná (192.168.0.122)\n   • Ind. Naviraí - MS (192.168.1.48)\n   • Caiari Distribuidora (192.168.0.250)\n2. Processamento em 2 ciclos no NGPonto (7452 e 6716)\n3. Sincronização direta com a Matriz de Ponto\n4. Geração do relatório e e-mail de pendências de ontem')) {
    return;
  }

  showToast('🌅 [1/4] Disparando Rotina Matinal: Conectando aos 4 relógios REP...');
  await coletarRelogioApp(0);

  showToast('✉️ [3/3] Abrindo painel de envio de e-mails com as pendências de ontem formatadas...');
  const btnRel = document.getElementById('subtab-btn-relatorio');
  if (btnRel) btnRel.click();
  definirDataEmailRelativaApp(-1);
  showToast('🎉 Rotina Matinal concluída com sucesso!');
}

async function sincronizarBatidasNGParaMatriz(mes, ano) {
  console.log('[Dashboard Blindado] Sincronismo da matriz com NGPonto desativado permanentemente para proteger alterações manuais.');
  showToast('ℹ️ O Dashboard de Ponto é exclusivo para gestão manual e está desconectado do NGPonto para preservar suas alterações.', 'info');
}

/**
 * function isDiaNaoReferenteAPendencia(appColab, isoStr, fromNGMotor = false) {
  if (!appColab) return false;

  // 1. Colaborador registrado no AppLucas que NÃO bate ponto (excluído de pendências)
  const naoBate = appColab.registraPonto === false 
    || appColab.registraPonto === 'nao' 
    || appColab.registraPonto === 'false' 
    || appColab.registraPonto === 0 
    || appColab.registraPonto === '0';
  if (naoBate) return true;

  if (!isoStr) return false;

  // 2. Data fora do período contratual (antes da admissão ou após demissão)
  if (appColab.admissao && isoStr < appColab.admissao) return true;
  if (appColab.status === 'demitido' && appColab.dataDemissao && isoStr > appColab.dataDemissao) return true;

  // 3. Feriado registrado no calendário do sistema
  if (typeof isHoliday === 'function' && isHoliday(isoStr, appColab.filialId)) return true;

  // 4. Domingo ou Sábado sem expediente (folga de sábado)
  const dt = new Date(isoStr + 'T12:00:00');
  const dw = dt.getDay();
  if (dw === 0) return true;
  if (dw === 6 && typeof isColabFolgaSabado === 'function' && isColabFolgaSabado(appColab)) return true;

  const hoje = new Date();
  const todayIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const reg = typeof getPontoRecord === 'function' ? getPontoRecord(appColab.id, isoStr) : null;
  const isStaleFutureEmpty = reg && reg.note === 'Dia futuro em aberto (desmarcado)' && isoStr <= todayIso;

  // 5. Override direto nos registros de ponto do AppLucas
  if (reg && !isStaleFutureEmpty) {
    const ov = (reg.override || '').toUpperCase();
    const res = (reg.resolution || '').toUpperCase();
    if (ov === 'FÉRIAS' || ov === 'FERIAS') return true;
    if (ov === 'ATESTADO' || ov === '1/2 ATESTADO') return true;
    if (ov === 'AFASTADO' || ov === 'AFAST') return true;
    if (res === 'ABONAR') return true;
    // Se veio do motor NGPonto com pendência real (atraso/batida faltante), só ignora se foi abonado/OK manualmente pelo usuário
    if (!fromNGMotor && ov === 'VAZIO') return true;
    if (ov === 'OK' && !reg.sincronizadoNG && !(reg.atrasoMaiorMin > 5)) return true;
  }

  // 6. Status consolidado do dia no Dashboard de Ponto (getDayStatus)
  if (typeof getDayStatus === 'function' && !isStaleFutureEmpty) {
    const dayStatus = getDayStatus(appColab.id, isoStr, appColab.filialId);
    if (dayStatus) {
      const st = (dayStatus.type || '').toUpperCase();
      if (st === 'FÉRIAS' || st === 'FERIAS') return true;
      if (st === 'ATESTADO' || st === '1/2 ATESTADO') return true;
      if (dayStatus.resolution === 'ABONAR') return true;
      if (st === 'AFASTADO' || st === 'AFAST') return true;
      if (st === 'DOMINGO' || st === 'SÁBADO') return true;
      if (dayStatus.isHoliday || dayStatus.isDisabled || dayStatus.isDismissed) return true;
      if (!fromNGMotor && (st === 'VAZIO' || dayStatus.isEmptyDay)) return true;
    }
  }

  return false;
}

/**
 * Filtra as pendências brutas do NGPonto cruzando com o dashboard do AppLucas:
 * - Exclui colaboradores que NÃO batem ponto (registraPonto === false)
 * - Exclui dias com VAZIO, FÉRIAS, ATESTADO ou qualquer justificativa
 * - Recalcula resumo de KPIs fielmente
 */
function filtrarPendenciasComDashboardApp(dadosMotor) {
  if (!dadosMotor || !Array.isArray(dadosMotor.colaboradores)) return dadosMotor;

  const resultado = JSON.parse(JSON.stringify(dadosMotor));

  let totalFaltas = 0;
  let totalFaltasMeio = 0;
  let totalBatidasAusentes = 0;
  let totalAtrasos = 0;
  let comPendencias = 0;
  let totalValidos = 0;

  resultado.colaboradores = resultado.colaboradores.filter(c => {
    const codNum = parseInt(c.codigo, 10);
    const appColab = appState.colaboradores.find(x => x.cracha === codNum && (c.idowner === 6716 ? x.filialId === 'branch-4' : x.filialId !== 'branch-4'))
      || appState.colaboradores.find(x => x.cracha === codNum);

    // REGRA 1: Colaboradores no AppLucas que NÃO batem ponto
    if (appColab) {
      const naoBate = appColab.registraPonto === false 
        || appColab.registraPonto === 'nao' 
        || appColab.registraPonto === 'false' 
        || appColab.registraPonto === 0 
        || appColab.registraPonto === '0';
      if (naoBate) {
        c.temPendencia = false;
        c.pendencias = [];
        c.qtdPendencias = 0;
        return false;
      }
    }

    totalValidos++;

    // REGRA 2: Filtra dias com VAZIO, FÉRIAS, ATESTADO ou não-pendência
    if (c.pendencias && Array.isArray(c.pendencias)) {
      c.pendencias = c.pendencias.filter(p => {
        const iso = p.dataIso || (p.data && p.data.includes('/') ? p.data.split('/').reverse().join('-') : p.data);
        if (!iso) return true;

        if (isDiaNaoReferenteAPendencia(appColab, iso, true)) {
          return false;
        }
        return true;
      });

      c.temPendencia = c.pendencias.length > 0;
      c.qtdPendencias = c.pendencias.length;

      if (c.temPendencia) {
        comPendencias++;
        c.pendencias.forEach(p => {
          const st = (p.status || '').toUpperCase();
          if (st === 'FALTA') totalFaltas++;
          else if (st === 'FM' || st === 'FT') totalFaltasMeio++;
          else if (['EM', 'SM', 'ET', 'ST'].includes(st) || st.includes('+')) totalBatidasAusentes++;
          if (p.atrasoMinutos && p.atrasoMinutos > 5) totalAtrasos++;
        });
      }
    }

    return true;
  });

  resultado.resumo = {
    totalColaboradores: totalValidos,
    comPendencias: comPendencias,
    totalFaltas: totalFaltas,
    totalFaltasMeio: totalFaltasMeio,
    totalBatidasAusentes: totalBatidasAusentes,
    totalAtrasos: totalAtrasos
  };

  return resultado;
}

/**
 * Gera o relatório de pendências diretamente do Dashboard Local de forma instantânea e 100% confiável.
 * Exclui rigorosamente: Motoristas, Vendedores, Vigias, Guardas e Autônomos (que não batem ponto).
 */
function gerarPendenciasDoDashboardLocal() {
  const mesAtual = appState.currentMonth + 1;
  const anoAtual = appState.currentYear;
  const numDays = new Date(anoAtual, mesAtual, 0).getDate();

  let totalFaltas = 0;
  let totalFaltasMeio = 0;
  let totalBatidasAusentes = 0;
  let totalAtrasos = 0;
  let comPendencias = 0;
  let totalValidos = 0;

  const listaColabs = [];

  const getSetorColab = (c) => {
    if (c.setor && c.setor.includes('(')) return c.setor;
    if (c.filialId === 'branch-4') return 'Relógio Caiari (6716)';
    if (c.filialId === 'branch-2') return 'Ind. Naviraí - MS (7452)';
    if (c.deptId === 'dept-admin-sponto' || c.relogioVinculo === 'folha_manual') return 'Folha Manual (7452)';
    if (c.deptId === 'dept-admin' || c.relogioVinculo === 'relogio2_adm') return 'ADM Ji-Paraná (7452)';
    return 'Produção - Depósito I (7452)';
  };

  const folhaManualCrachas = [325, 336, 431, 540, 696, 702, 736, 781, 898, 937, 965, 974, 1020, 1027, 1031, 1032];

  (appState.colaboradores || []).forEach(c => {
    const codNum = Number(c.cracha);

    // REGRA DE OURO: Motoristas, vendedores, vigias, guardas e autônomos NÃO batem ponto e NÃO entram em pendências
    if (c.registraPonto === false || c.relogioVinculo === 'folha_manual' || c.relogioVinculo === 'isentos' || c.deptId === 'dept-admin-sponto' || folhaManualCrachas.includes(codNum)) {
      return;
    }
    if (c.status === 'demitido' && c.dataDemissao && new Date(c.dataDemissao) < new Date(anoAtual, mesAtual - 1, 1)) {
      return;
    }

    totalValidos++;
    const pendencias = [];

    for (let d = 1; d <= numDays; d++) {
      const isoDate = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      // Não gera pendência para datas futuras
      const dataObj = new Date(anoAtual, mesAtual - 1, d);
      const hoje = new Date();
      hoje.setHours(23, 59, 59, 999);
      if (dataObj > hoje) continue;

      if (isDiaNaoReferenteAPendencia(c, isoDate)) continue;

      const reg = getPontoRecord(c.id, isoDate);
      const stObj = getDayStatus(c.id, isoDate, c.filialId);
      const st = (stObj?.type || reg?.override || '').toUpperCase();

      const isAtraso = st === 'ATRASO' || (stObj?.delayMinutes > 5) || (reg?.override !== 'AUTO' && ((reg?.atrasoMaiorMin > 5) || (reg?.atrasoMaior && parseTimeToMinutes(reg.atrasoMaior) > 5)));

      if (['FALTA', 'FM', 'FT', 'EM', 'SM', 'ET', 'ST'].includes(st) || st.includes('+')) {
        let atrasoMin = (reg?.override === 'AUTO') ? (stObj?.delayMinutes || 0) : (reg?.atrasoMaiorMin || stObj?.delayMinutes || 0);
        if (!atrasoMin && reg?.override !== 'AUTO' && reg?.atrasoMaior) atrasoMin = parseTimeToMinutes(reg.atrasoMaior);

        pendencias.push({
          data: formatDateBR(isoDate),
          dataIso: isoDate,
          dia: d,
          status: st,
          atrasoMinutos: atrasoMin,
          descricao: stObj?.display || st
        });

        if (st === 'FALTA') totalFaltas++;
        else if (st === 'FM' || st === 'FT') totalFaltasMeio++;
        else totalBatidasAusentes++;
        if (atrasoMin > 5) totalAtrasos++;
      } else if (isAtraso) {
        const aMin = (reg?.override === 'AUTO') ? (stObj?.delayMinutes || 0) : (reg?.atrasoMaiorMin || stObj?.delayMinutes || parseTimeToMinutes(reg?.atrasoMaior || '00:00'));
        pendencias.push({
          data: formatDateBR(isoDate),
          dataIso: isoDate,
          dia: d,
          status: 'ATRASO',
          atrasoMinutos: aMin,
          descricao: `Atraso ${minutesToTime(aMin)}`
        });
        totalAtrasos++;
      }
    }

    const temPend = pendencias.length > 0;
    if (temPend) comPendencias++;

    listaColabs.push({
      idowner: c.filialId === 'branch-4' ? 6716 : 7452,
      idregistro: c.idregistro || c.cracha,
      codigo: String(c.cracha).padStart(6, '0'),
      nome: c.nome,
      cargo: c.cargo || '',
      setor: getSetorColab(c),
      temPendencia: temPend,
      totalPendencias: pendencias.length,
      pendencias: pendencias
    });
  });

  return {
    ok: true,
    mes: mesAtual,
    ano: anoAtual,
    resumo: {
      totalColaboradores: totalValidos,
      comPendencias: comPendencias,
      totalFaltas: totalFaltas,
      totalFaltasMeio: totalFaltasMeio,
      totalBatidasAusentes: totalBatidasAusentes,
      totalAtrasos: totalAtrasos
    },
    colaboradores: listaColabs
  };
}

async function carregarPendenciasRelatorioApp(forcar = false) {
  const mes = appState.currentMonth + 1;
  const ano = appState.currentYear;
  let dados = null;

  try {
    const res = await fetch(`${API_BASE}/api/pendencias?idowner=0&mes=${mes}&ano=${ano}${forcar ? '&refresh=1' : ''}`).then(r => r.json());
    if (res && res.ok && Array.isArray(res.colaboradores) && res.colaboradores.length > 0) {
      dados = filtrarPendenciasComDashboardApp(res);
    }
  } catch (e) {
    console.log('API de pendências remota indisponível, gerando diretamente do Dashboard Local...');
  }

  // Fallback instantâneo e garantido diretamente do Dashboard (funciona 100% no Vercel e Local)
  if (!dados) {
    dados = gerarPendenciasDoDashboardLocal();
  }

  impState.pendenciasRaw = dados;
  impState.pendenciasCache = dados;

  if (dados.resumo) {
    atualizarKpisCards(dados.resumo);
  }
  atualizarTextoEmailApp();
  if (forcar) showToast('✅ Relatório de pendências atualizado e sincronizado com o dashboard!');
}

function atualizarKpisCards(resumo) {
  const elTot = document.getElementById('kpi-total-colabs');
  const elCom = document.getElementById('kpi-com-pendencias');
  const elFal = document.getElementById('kpi-faltas-integrais');
  const elMei = document.getElementById('kpi-meio-periodo');
  const elBat = document.getElementById('kpi-batidas-ausentes');
  const elAtr = document.getElementById('kpi-atrasos-apurados');

  if (elTot) elTot.textContent = resumo.totalColaboradores ?? '--';
  if (elCom) elCom.textContent = resumo.comPendencias ?? '--';
  if (elFal) elFal.textContent = resumo.totalFaltas ?? '--';
  if (elMei) elMei.textContent = resumo.totalFaltasMeio ?? '--';
  if (elBat) elBat.textContent = resumo.totalBatidasAusentes ?? '--';
  if (elAtr) elAtr.textContent = resumo.totalAtrasos ?? '--';
}

function definirDataEmailRelativaApp(offset = -1) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  if (d.getDay() === 0) d.setDate(d.getDate() - 1); // Se cair domingo, pula pro sábado
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const inDia = document.getElementById('email-dia-ref');
  if (inDia) {
    inDia.value = `${dd}/${mm}`;
    atualizarTextoEmailApp();
  }
}

function atualizarTextoEmailApp() {
  const selSetor = document.getElementById('email-filial-select');
  const inDia = document.getElementById('email-dia-ref');
  if (!selSetor || !inDia) return;

  const setor = selSetor.value;
  let diaRef = inDia.value.trim();

  // Carrega destinatários salvos (limpa cache antigo se tiver emails fictícios/antigos)
  let salvos = {};
  try {
    const raw = localStorage.getItem('destinatarios_pendencias_email');
    if (raw && (raw.includes('pedro@') || raw.includes('gerenciams@') || raw.includes('dp@caiari') || raw.includes('edson@'))) {
      localStorage.removeItem('destinatarios_pendencias_email');
    } else if (raw) {
      salvos = JSON.parse(raw);
    }
  } catch (e) {}

  const cfg = salvos[setor] || DESTINATARIOS_FILIAIS_PADRAO[setor] || { to: '', cc: '' };

  const inTo = document.getElementById('email-destinatario-input');
  const inCc = document.getElementById('email-copia-input');
  const inAss = document.getElementById('email-assunto-input');
  const inCorpo = document.getElementById('email-corpo-textarea');

  if (inTo) inTo.value = cfg.to || '';
  if (inCc) inCc.value = cfg.cc || '';
  if (inAss) inAss.value = `PENDENCIAS ${diaRef || 'DO DIA'}`;
  if (inCorpo) inCorpo.value = gerarTextoEmailPendenciasApp(setor, diaRef);
}

function gerarTextoEmailPendenciasApp(setorFiltro, diaRef) {
  if (setorFiltro === 'ADM Ji-Paraná (7452)') {
    const countEl = document.getElementById('email-contagem-pendencias');
    if (countEl) countEl.textContent = '0 (Setor ADM não envia pendências)';
    return 'Conforme acordado, o setor Administrativo de Ji-Paraná não possui envio de pendências por e-mail.';
  }

  if (!impState.pendenciasCache || !impState.pendenciasCache.colaboradores) {
    return 'Nenhum dado de pendência carregado ainda. Clique em "Atualizar Relatório" acima.';
  }

  let filtrados = impState.pendenciasCache.colaboradores.filter(c => c.temPendencia);
  if (setorFiltro && setorFiltro !== 'TODOS') {
    filtrados = filtrados.filter(c => c.setor === setorFiltro);
  }

  let todosColabsDoSetor = impState.pendenciasCache.colaboradores || [];
  if (setorFiltro && setorFiltro !== 'TODOS') {
    todosColabsDoSetor = todosColabsDoSetor.filter(c => c.setor === setorFiltro);
  }

  const linhas = [];

  filtrados.forEach((c) => {
    const codNum = parseInt(c.codigo, 10);
    const appColab = appState.colaboradores.find(x => x.cracha === codNum && (c.idowner === 6716 ? x.filialId === 'branch-4' : x.filialId !== 'branch-4'))
      || appState.colaboradores.find(x => x.cracha === codNum);

    // Garante que colaborador registrado no AppLucas como não bate ponto nunca entre no email
    if (appColab) {
      const naoBate = appColab.registraPonto === false 
        || appColab.registraPonto === 'nao' 
        || appColab.registraPonto === 'false' 
        || appColab.registraPonto === 0 
        || appColab.registraPonto === '0';
      if (naoBate) return;
    }

    let pendsColab = c.pendencias || [];
    if (diaRef) {
      const dRef = diaRef.trim();
      pendsColab = pendsColab.filter(p => {
        const matchesDate = (p.data && p.data.startsWith(dRef)) 
          || (p.dataIso && (p.dataIso.endsWith(dRef.replace('/', '-')) || p.dataIso === dRef));
        if (!matchesDate) return false;

        const iso = p.dataIso || (p.data && p.data.includes('/') ? p.data.split('/').reverse().join('-') : p.data);
        if (isDiaNaoReferenteAPendencia(appColab, iso)) {
          return false;
        }
        return true;
      });
    }

    if (pendsColab.length > 0) {
      const nomeFormatado = formatarNomeColaboradorApp(c, todosColabsDoSetor);
      const pendDesc = pendsColab.map(p => formatarDescricaoPendenciaApp(p)).join(' + ');
      linhas.push({
        codigoNum: parseInt(c.codigo, 10) || 0,
        linha: `${nomeFormatado} - ${pendDesc}`
      });
    }
  });

  const countEl = document.getElementById('email-contagem-pendencias');
  if (countEl) countEl.textContent = `${linhas.length} pendências encontradas`;

  if (linhas.length === 0) {
    return 'Nenhuma pendência encontrada para esta data/filial.';
  }

  const ehProducao = setorFiltro && (setorFiltro.toLowerCase().includes('produção') || setorFiltro.toLowerCase().includes('producao'));
  if (ehProducao) {
    linhas.sort((a, b) => a.codigoNum - b.codigoNum);
  } else {
    linhas.sort((a, b) => a.linha.localeCompare(b.linha, 'pt-BR'));
  }

  return linhas.map(x => x.linha).join('\n\n');
}

function formatarNomeColaboradorApp(colab, listaSetor) {
  if (!colab || !colab.nome) return 'Colaborador';
  const partes = colab.nome.trim().split(/\s+/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
  if (partes.length === 0) return 'Colaborador';

  const primeiroNome = partes[0];

  const outrosComMesmoNome = (listaSetor || []).filter(c => {
    if (c.idregistro === colab.idregistro) return false;
    const outroPrimeiro = c.nome.trim().split(/\s+/)[0].toLowerCase();
    return outroPrimeiro === primeiroNome.toLowerCase();
  });

  if (outrosComMesmoNome.length > 0 && partes.length > 1) {
    return `${primeiroNome} ${partes[1]}`;
  }

  if (partes.length > 1 && ['Paulo', 'Joao', 'Jose', 'Maria', 'Ana', 'Pedro', 'Luiz', 'Vitor'].includes(primeiroNome)) {
    return `${primeiroNome} ${partes[1]}`;
  }

  return primeiroNome;
}

function formatarDescricaoPendenciaApp(p) {
  const partes = [];

  if (p.atrasoMinutos && p.atrasoMinutos > 5) {
    if (p.atrasoMinutos >= 60) {
      const h = String(Math.floor(p.atrasoMinutos / 60)).padStart(2, '0');
      const m = String(p.atrasoMinutos % 60).padStart(2, '0');
      partes.push(`Atraso ${h}:${m}`);
    } else {
      partes.push(`Atraso ${p.atrasoMinutos} Minutos`);
    }
  }

  const st = (p.status || '').toUpperCase();
  if (st === 'FALTA') partes.push('Falta');
  else if (st === 'FM') partes.push('Falta periodo manhã');
  else if (st === 'FT') partes.push('Falta periodo da tarde');
  else if (st === 'EM') partes.push('Entrada manhã');
  else if (st === 'SM') partes.push('Saida manhã');
  else if (st === 'ET') partes.push('Entrada da tarde');
  else if (st === 'ST') partes.push('Saida da tarde');
  else if (st.includes('+')) {
    const sub = st.split('+').map(s => s.trim());
    sub.forEach(s => {
      if (s === 'EM') partes.push('Entrada manhã');
      else if (s === 'SM') partes.push('Saida manhã');
      else if (s === 'ET') partes.push('Entrada da tarde');
      else if (s === 'ST') partes.push('Saida da tarde');
      else if (s === 'FM') partes.push('Falta periodo manhã');
      else if (s === 'FT') partes.push('Falta periodo da tarde');
      else if (s === 'FALTA') partes.push('Falta');
    });
  }

  const unicos = [];
  partes.forEach(x => { if (!unicos.includes(x)) unicos.push(x); });

  if (unicos.length === 0) {
    return (p.status && p.status !== 'OK') ? p.status : 'Pendente';
  }

  return unicos.join(' + ');
}

function abrirGmailApp() {
  const to = document.getElementById('email-destinatario-input')?.value.trim() || '';
  const cc = document.getElementById('email-copia-input')?.value.trim() || '';
  const su = document.getElementById('email-assunto-input')?.value.trim() || '';
  const body = document.getElementById('email-corpo-textarea')?.value || '';

  const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&cc=${encodeURIComponent(cc)}&su=${encodeURIComponent(su)}&body=${encodeURIComponent(body)}`;
  window.open(url, '_blank');
  showToast('🚀 Nova guia aberta no Google Chrome com o Gmail preenchido!');
}

function abrirWhatsAppApp() {
  const body = document.getElementById('email-corpo-textarea')?.value || '';
  const su = document.getElementById('email-assunto-input')?.value || '';
  const texto = `*${su}*\n\n${body}`;
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
  showToast('📱 WhatsApp Web aberto com as pendências pré-formatadas!');
}

function copiarTextoEmailApp() {
  const txt = document.getElementById('email-corpo-textarea')?.value || '';
  navigator.clipboard.writeText(txt).then(() => {
    showToast('📋 Texto do e-mail copiado para a área de transferência!');
  }).catch(() => {
    const tArea = document.getElementById('email-corpo-textarea');
    if (tArea) {
      tArea.select();
      document.execCommand('copy');
      showToast('📋 Texto copiado!');
    }
  });
}

function salvarDestinatariosApp() {
  const setor = document.getElementById('email-filial-select')?.value;
  const to = document.getElementById('email-destinatario-input')?.value.trim() || '';
  const cc = document.getElementById('email-copia-input')?.value.trim() || '';

  let salvos = {};
  try { salvos = JSON.parse(localStorage.getItem('destinatarios_pendencias_email') || '{}'); } catch (e) {}
  salvos[setor] = { to, cc };
  localStorage.setItem('destinatarios_pendencias_email', JSON.stringify(salvos));
  showToast(`💾 Destinatários da filial "${setor}" salvos como padrão no seu navegador!`);
}

async function carregarVinculosRelogiosApp() {
  try {
    const res = await fetch(`${API_BASE}/api/relogios-vinculos`).then(r => r.json());
    if (res && res.ok && res.vinculos) {
      impState.vinculos = res.vinculos;
      atualizarContadoresVinculosApp(res.vinculos);
      renderRelogiosVinculosTable();
      return;
    }
  } catch (e) {
    console.log('API de relógios indisponível, usando vínculos pré-cadastrados (Nuvem / Local)...');
  }

  // Fallback garantido usando os vínculos pré-cadastrados da empresa
  if (!impState.vinculos) {
    impState.vinculos = DEFAULT_RELOGIOS_VINCULOS;
  }
  atualizarContadoresVinculosApp(impState.vinculos);
  renderRelogiosVinculosTable();
}

function atualizarContadoresVinculosApp(vinculos) {
  const c1 = document.getElementById('count-relogio1');
  const c2 = document.getElementById('count-relogio2');
  const c3 = document.getElementById('count-relogio3');
  const c4 = document.getElementById('count-relogio4');
  const cMan = document.getElementById('count-folha-manual');
  const cIse = document.getElementById('count-isentos');

  if (c1) c1.textContent = (vinculos.relogio1_producao || []).length;
  if (c2) c2.textContent = (vinculos.relogio2_adm || []).length;
  if (c3) c3.textContent = (vinculos.relogio3_navirai || []).length;
  if (c4) c4.textContent = (vinculos.relogio4_caiari || []).length;
  if (cMan) cMan.textContent = (vinculos.folha_manual || []).length;
  if (cIse) cIse.textContent = (vinculos.isentos || []).length;
}

function renderRelogiosVinculosTable() {
  const tbody = document.getElementById('tb-vinculos-relogios');
  if (!tbody) return;

  const vinculos = impState.vinculos || {};
  const mapCodToRel = new Map();

  ['relogio1_producao', 'relogio2_adm', 'relogio3_navirai', 'relogio4_caiari', 'folha_manual', 'isentos'].forEach(grupo => {
    (vinculos[grupo] || []).forEach(item => {
      mapCodToRel.set(Number(item.cod), grupo);
    });
  });

  const filtro = impState.filtroVinculo || 'TODOS';
  const busca = impState.buscaVinculo || '';

  const colabsFiltrados = appState.colaboradores.filter(c => {
    const cod = Number(c.cracha);
    const grupo = mapCodToRel.get(cod) || 'relogio1_producao';

    if (filtro !== 'TODOS' && grupo !== filtro) return false;

    if (busca) {
      const matchNome = (c.nome || '').toLowerCase().includes(busca);
      const matchCod = String(c.cracha).includes(busca);
      const matchCargo = (c.cargo || '').toLowerCase().includes(busca);
      if (!matchNome && !matchCod && !matchCargo) return false;
    }

    return true;
  });

  colabsFiltrados.sort((a, b) => Number(a.cracha) - Number(b.cracha));

  tbody.innerHTML = colabsFiltrados.map(c => {
    const cod = Number(c.cracha);
    const grupoAtual = mapCodToRel.get(cod) || 'relogio1_producao';
    const filial = appState.filiais.find(f => f.id === c.filialId);
    const nomeFilial = filial ? filial.nome : 'Matriz';

    return `
      <tr data-cod="${cod}" data-nome="${escapeHtml(c.nome)}" data-cargo="${escapeHtml(c.cargo || '')}">
        <td><strong>${c.cracha}</strong></td>
        <td>
          <div style="font-weight:600; color:var(--color-cyan);">${escapeHtml(c.nome)}</div>
          <small style="color:var(--color-text-sub);">${c.cpf ? 'CPF: ' + c.cpf : ''}</small>
        </td>
        <td>${escapeHtml(nomeFilial)}</td>
        <td>${escapeHtml(c.cargo || 'Não informado')}</td>
        <td>
          <select class="form-control select-vinculo-relogio" style="padding:4px 8px; font-size:12px;">
            <option value="relogio1_producao" ${grupoAtual === 'relogio1_producao' ? 'selected' : ''}>Relógio 1: Produção Depósito I (14)</option>
            <option value="relogio2_adm" ${grupoAtual === 'relogio2_adm' ? 'selected' : ''}>Relógio 2: ADM Ji-Paraná (9)</option>
            <option value="relogio3_navirai" ${grupoAtual === 'relogio3_navirai' ? 'selected' : ''}>Relógio 3: Ind. Naviraí MS (13)</option>
            <option value="relogio4_caiari" ${grupoAtual === 'relogio4_caiari' ? 'selected' : ''}>Relógio 4: Caiari (18)</option>
            <option value="folha_manual" ${grupoAtual === 'folha_manual' ? 'selected' : ''}>Folha Manual (Sem REP)</option>
            <option value="isentos" ${grupoAtual === 'isentos' ? 'selected' : ''}>Isento / Autônomo</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');
}

async function salvarVinculosRelogiosApp() {
  showToast('💾 Gravando novos vínculos de relógios no NGPonto...');
  const novosVinculos = {
    relogio1_producao: [],
    relogio2_adm: [],
    relogio3_navirai: [],
    relogio4_caiari: [],
    folha_manual: [],
    isentos: []
  };

  const rows = document.querySelectorAll('#tb-vinculos-relogios tr');
  rows.forEach(tr => {
    const cod = parseInt(tr.dataset.cod, 10);
    const nome = tr.dataset.nome || '';
    const cargo = tr.dataset.cargo || '';
    const sel = tr.querySelector('.select-vinculo-relogio');
    const grupo = sel ? sel.value : 'relogio1_producao';

    if (novosVinculos[grupo]) {
      novosVinculos[grupo].push({ cod, nome, cargo });
    }
  });

  // Também preserva os colaboradores que não estavam visíveis no filtro atual
  if (impState.vinculos) {
    const jaAdicionados = new Set();
    Object.keys(novosVinculos).forEach(g => {
      novosVinculos[g].forEach(item => jaAdicionados.add(item.cod));
    });

    Object.keys(impState.vinculos).forEach(g => {
      (impState.vinculos[g] || []).forEach(item => {
        if (!jaAdicionados.has(item.cod) && novosVinculos[g]) {
          novosVinculos[g].push(item);
          jaAdicionados.add(item.cod);
        }
      });
    });
  }

  try {
    const res = await fetch(`${API_BASE}/api/relogios-vinculos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vinculos: novosVinculos })
    }).then(r => r.json());

    if (res.ok) {
      impState.vinculos = novosVinculos;
      atualizarContadoresVinculosApp(novosVinculos);
      showToast('🎉 Vínculos de relógios atualizados e gravados com sucesso!');
    } else {
      showToast('Erro ao salvar vínculos: ' + res.erro, 'error');
    }
  } catch (e) {
    showToast('Erro de comunicação: ' + e.message, 'error');
  }
}

let debounceTimerNG = null;

function setupAutoLookupNGPonto() {
  const badgeInput = document.getElementById('emp-badge');
  const branchSelect = document.getElementById('emp-branch');

  const triggerLookup = () => {
    clearTimeout(debounceTimerNG);
    debounceTimerNG = setTimeout(() => {
      autoBuscarDadosNGPonto(false);
    }, 350);
  };

  badgeInput?.addEventListener('input', triggerLookup);
  branchSelect?.addEventListener('change', triggerLookup);
}

function formatNgDateToIso(str) {
  if (!str) return '';
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return str;
}

function formatarCpfParcial(cpf) {
  if (!cpf) return 'Não informado';
  const clean = cpf.replace(/\D/g, '').padStart(11, '0');
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

async function autoBuscarDadosNGPonto(silencioso = false) {
  const badgeInput = document.getElementById('emp-badge');
  const branchSelect = document.getElementById('emp-branch');
  const editId = document.getElementById('emp-edit-id')?.value;

  const cod = badgeInput ? parseInt(badgeInput.value, 10) : 0;
  if (!cod || isNaN(cod) || cod <= 0) {
    const syncInfo = document.getElementById('emp-ng-sync-info');
    if (syncInfo && !editId) syncInfo.style.display = 'none';
    return;
  }

  const filialId = branchSelect ? branchSelect.value : (appState.activeBranchId || 'branch-1');

  // Garante cache da lista de colaboradores NGPonto para agilidade máxima
  if (!impState.colaboradoresNGCache || impState.colaboradoresNGCache.length === 0) {
    try {
      const res = await fetch(`${API_BASE}/api/colaboradores`).then(r => r.json());
      if (res && res.ok && Array.isArray(res.colaboradores)) {
        impState.colaboradoresNGCache = res.colaboradores;
      }
    } catch (e) {
      console.warn('Erro ao consultar /api/colaboradores:', e);
      return;
    }
  }

  if (!impState.colaboradoresNGCache || impState.colaboradoresNGCache.length === 0) return;

  // Priorização por filial: Caiari (branch-4) usa idowner 6716; Ji-Paraná / Naviraí usam 7452
  const preferredOwner = filialId === 'branch-4' ? 6716 : 7452;
  let c = impState.colaboradoresNGCache.find(x => parseInt(x.codigo, 10) === cod && x.idowner === preferredOwner);
  if (!c) {
    c = impState.colaboradoresNGCache.find(x => parseInt(x.codigo, 10) === cod);
  }

  const syncInfo = document.getElementById('emp-ng-sync-info');
  const badgeTxt = document.getElementById('emp-ng-status-badge');
  const detLine = document.getElementById('emp-ng-details-line');

  if (c) {
    // 1. Preenche Nome
    const nameInput = document.getElementById('emp-name');
    if (nameInput && (!editId || !nameInput.value.trim())) {
      nameInput.value = c.nome || '';
    }

    // 2. Preenche Admissão
    const admInput = document.getElementById('emp-admission');
    if (admInput && (!editId || !admInput.value)) {
      const isoAdm = formatNgDateToIso(c.admissao);
      if (isoAdm) admInput.value = isoAdm;
    }

    // 3. Preenche Campos Ocultos (desnecessários na visualização principal, salvos automaticamente)
    const inCpf = document.getElementById('emp-cpf'); if (inCpf) inCpf.value = c.cpf || '';
    const inPis = document.getElementById('emp-pis'); if (inPis) inPis.value = c.pis || '';
    const inCargo = document.getElementById('emp-cargo'); if (inCargo) inCargo.value = c.cargo || '';
    const inIdR = document.getElementById('emp-idregistro-ng'); if (inIdR) inIdR.value = c.idregistro || '';
    const inIdOw = document.getElementById('emp-idowner-ng'); if (inIdOw) inIdOw.value = c.idowner || '';
    const inQ = document.getElementById('emp-quadro-ng');
    const qTxt = `${c.horario1 || ''}${c.horario2 ? ' / Sáb: ' + c.horario2 : ''}`.trim() || c.codigoQuadro || '';
    if (inQ) inQ.value = qTxt;

    const inRel = document.getElementById('emp-relogio-vinculo');
    if (inRel) {
      if (c.idowner === 6716) inRel.value = 'relogio4_caiari';
      else if (c.setor?.includes('Naviraí')) inRel.value = 'relogio3_navirai';
      else if (c.setor?.includes('ADM')) inRel.value = 'relogio2_adm';
      else if (c.setor?.includes('Manual')) inRel.value = 'folha_manual';
      else if (c.tipoFuncionario === 'Autônomo') inRel.value = 'isentos';
      else inRel.value = 'relogio1_producao';
    }

    // 4. Preenche Escalas de Trabalho (Sábado, Aprendiz, Autônomo) a partir do NGPonto
    const isAuto = c.tipoFuncionario === 'Autônomo';
    const isAp = (c.cargo && /aprendi/i.test(c.cargo)) || (c.horario1 === '14:00 18:00');

    let trabalhaSabado = true;
    if (c.horariosSemana && c.horariosSemana['7']) {
      const s7 = c.horariosSemana['7'];
      trabalhaSabado = !s7.descanso && Boolean(s7.e1 || s7.s1);
    } else if (isAp || isAuto) {
      trabalhaSabado = false;
    }

    const checkRegistra = document.getElementById('emp-check-registra-ponto');
    const checkNaoRecebeVa = document.getElementById('emp-check-nao-recebe-va');
    const checkTrabalhaSabado = document.getElementById('emp-check-trabalha-sabado') || document.getElementById('emp-check-aprendiz-sabado');
    const checkAprendiz = document.getElementById('emp-check-aprendiz');

    if (isAuto) {
      if (checkRegistra) checkRegistra.checked = false;
      if (checkNaoRecebeVa) checkNaoRecebeVa.checked = true;
      if (checkTrabalhaSabado) checkTrabalhaSabado.checked = false;
      if (checkAprendiz) checkAprendiz.checked = false;
    } else if (isAp) {
      if (checkRegistra) checkRegistra.checked = true;
      if (checkNaoRecebeVa) checkNaoRecebeVa.checked = false;
      if (checkAprendiz) checkAprendiz.checked = true;
      if (checkTrabalhaSabado) checkTrabalhaSabado.checked = trabalhaSabado;
    } else {
      if (checkRegistra) checkRegistra.checked = true;
      if (checkNaoRecebeVa) checkNaoRecebeVa.checked = false;
      if (checkAprendiz) checkAprendiz.checked = false;
      if (checkTrabalhaSabado) checkTrabalhaSabado.checked = trabalhaSabado;
    }

    // 5. Exibe Feedback Visual Compacto
    if (syncInfo) {
      syncInfo.style.display = 'block';
      if (badgeTxt) badgeTxt.textContent = '✨ Sincronizado do NGPonto';
      if (detLine) {
        const cpfFmt = formatarCpfParcial(c.cpf);
        const sabTxt = trabalhaSabado ? 'Trabalha' : 'Folga';
        detLine.textContent = `Cargo: ${c.cargo || 'Não informado'} • CPF: ${cpfFmt} • Escala Sábado: ${sabTxt}${isAp ? ' (Aprendiz)' : ''}`;
      }
    }

    if (!silencioso) {
      showToast(`✨ Colaborador "${c.nome}" identificado no NGPonto! Dados e escala carregados.`);
    }
  } else {
    if (syncInfo && !editId) {
      syncInfo.style.display = 'none';
    }
  }
}

async function buscarDadosNGPontoParaModalColab() {
  await autoBuscarDadosNGPonto(false);
}

async function aplicarEscalasNGPontoParaTodos(showFeedback = true) {
  if (showFeedback) showToast('🔄 Sincronizando escalas e dados de todos os funcionários com o NGPonto...');
  try {
    const res = await fetch(`${API_BASE}/api/colaboradores`).then(r => r.json());
    if (!res || !res.ok || !Array.isArray(res.colaboradores)) {
      if (showFeedback) showToast('Não foi possível obter dados do NGPonto.', 'warning');
      return;
    }

    const ngColabs = res.colaboradores;
    impState.colaboradoresNGCache = ngColabs;

    let alterados = 0;
    appState.colaboradores.forEach(colab => {
      const preferredOwner = colab.filialId === 'branch-4' ? 6716 : 7452;
      let match = ngColabs.find(c => parseInt(c.codigo, 10) === colab.cracha && c.idowner === preferredOwner);
      if (!match) {
        match = ngColabs.find(c => parseInt(c.codigo, 10) === colab.cracha);
      }

      if (match) {
        let mudou = false;

        // Dados complementares NGPonto (salvos no colaborador)
        if (match.cpf && colab.cpf !== match.cpf) { colab.cpf = match.cpf; mudou = true; }
        if (match.pis && colab.pis !== match.pis) { colab.pis = match.pis; mudou = true; }
        if (match.cargo && colab.cargo !== match.cargo) { colab.cargo = match.cargo; mudou = true; }
        if (match.idregistro) colab.idregistroNG = match.idregistro;
        if (match.idowner) colab.idownerNG = match.idowner;
        if (match.horariosSemana) colab.horariosSemana = match.horariosSemana;

        const qTxt = `${match.horario1 || ''}${match.horario2 ? ' / Sáb: ' + match.horario2 : ''}`.trim() || match.codigoQuadro || '';
        if (qTxt && colab.quadroNG !== qTxt) { colab.quadroNG = qTxt; mudou = true; }

        // Escalas automáticas derivadas do NGPonto
        const isAuto = match.tipoFuncionario === 'Autônomo';
        const isAp = (match.cargo && /aprendi/i.test(match.cargo)) || (match.horario1 === '14:00 18:00');

        let trabalhaSabado = true;
        if (match.horariosSemana && match.horariosSemana['7']) {
          const s7 = match.horariosSemana['7'];
          trabalhaSabado = !s7.descanso && Boolean(s7.e1 || s7.s1);
        } else if (isAp || isAuto) {
          trabalhaSabado = false;
        }

        if (colab.trabalhaSabado !== trabalhaSabado) {
          colab.trabalhaSabado = trabalhaSabado;
          mudou = true;
        }

        if (isAp && !colab.aprendiz) {
          colab.aprendiz = true;
          colab.isAprendiz = true;
          mudou = true;
        }

        if (isAuto) {
          if (colab.registraPonto !== false) { colab.registraPonto = false; mudou = true; }
          if (!colab.naoRecebeVa) { colab.naoRecebeVa = true; colab.recebeVa = false; mudou = true; }
        }

        if (mudou) alterados++;
      }
    });

    if (alterados > 0) {
      saveStateToStorage();
      if (appState.activeView === 'view-ponto') {
        renderMatrix();
      } else if (appState.activeView === 'view-colaboradores') {
        renderEmployeesList();
      }
      if (showFeedback) {
        showToast(`✨ Escalas e dados de ${alterados} colaboradores atualizados a partir do NGPonto!`);
      }
    } else {
      if (showFeedback) {
        showToast('Todas as escalas dos colaboradores já estão sincronizadas com o NGPonto.');
      }
    }
  } catch (e) {
    console.warn('API NGPonto local não respondeu (ambiente Nuvem/Vercel):', e);
    if (typeof window !== 'undefined' && (window.location.protocol === 'https:' || window.location.hostname.includes('vercel.app'))) {
      if (showFeedback) {
        showToast('☁️ Modo Nuvem: As escalas e vínculos de todos os funcionários já estão sincronizados e ativos na nuvem! Para acionar coleta direta dos relógios REP físicos na rede local, acesse pelo Painel Local (http://localhost:3000).', 'info');
      }
      return;
    }
    if (showFeedback) showToast('Não foi possível conectar ao motor NGPonto local (porta 3050). Verifique se o servidor local está ativo.', 'warning');
  }
}


