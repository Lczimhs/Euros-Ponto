/**
 * DASHBOARD DE PONTO E VALE ALIMENTAÇÃO (V4)
 * Motor Completo de Ponto, Apuração de VA, DSR e Gestão
 */

// Chave do LocalStorage
const STORAGE_KEY = 'appLucas_ponto_va_v5_data';

// ==========================================================================
// 1. ESTADO GLOBAL DA APLICAÇÃO
// ==========================================================================
let appState = {
  activeView: 'view-avisos',
  activeBranchId: 'branch-1',
  currentYear: 2026,
  currentMonth: 9, // Outubro (0-indexed: 9 = Outubro)
  statusFilter: 'ativos', // 'ativos' | 'demitidos' | 'todos'
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
// CONFIGURAÇÃO DO SUPABASE CLOUD
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

// ==========================================================================
// 2. DADOS PADRÃO DE DEMONSTRAÇÃO (SEED COM DADOS REAIS DA EMPRESA)
// ==========================================================================
function getDefaultSeedData() {
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
  }
];

  const colaboradores = [
  {
    "id": "colab-1026",
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
    "id": "colab-1031",
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
    "id": "colab-1",
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
    "id": "colab-218",
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
    "id": "colab-234",
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
    "id": "colab-325",
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
    "id": "colab-336",
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
    "id": "colab-354",
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
    "id": "colab-361",
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
    "id": "colab-431",
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
    "id": "colab-491",
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
    "id": "colab-540",
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
    "id": "colab-545",
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
    "id": "colab-663",
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
    "id": "colab-668",
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
    "id": "colab-696",
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
    "id": "colab-701",
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
    "id": "colab-702",
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
    "id": "colab-736",
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
    "id": "colab-778",
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
    "id": "colab-781",
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
    "id": "colab-847",
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
    "id": "colab-858",
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
    "id": "colab-863",
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
    "id": "colab-898",
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
    "id": "colab-900",
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
    "id": "colab-908",
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
    "id": "colab-914",
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
    "id": "colab-917",
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
    "id": "colab-1173",
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
    "id": "colab-1405",
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
    "id": "colab-937",
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
    "id": "colab-942",
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
    "id": "colab-954",
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
    "id": "colab-955",
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
    "id": "colab-961",
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
    "id": "colab-963",
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
    "id": "colab-965",
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
    "id": "colab-970",
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
    "id": "colab-974",
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
    "id": "colab-975",
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
    "id": "colab-986",
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
    "id": "colab-989",
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
    "id": "colab-997",
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
    "id": "colab-999",
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
    "id": "colab-1000",
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
    "id": "colab-1008",
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
    "id": "colab-1013",
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
    "id": "colab-1018",
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
    "id": "colab-1020",
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
    "id": "colab-1025",
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
    "id": "colab-1027",
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
    "id": "colab-1032",
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
    "id": "colab-1033",
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
    "id": "colab-1034",
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
    "id": "colab-1016",
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
    "id": "colab-127",
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
    "id": "colab-288",
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
    "id": "colab-456",
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
    "id": "colab-463",
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
    "id": "colab-561",
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
    "id": "colab-613",
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
    "id": "colab-780",
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
    "id": "colab-810",
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
    "id": "colab-867",
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
    "id": "colab-890",
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
    "id": "colab-946",
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
    "id": "colab-952",
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
    "id": "colab-964",
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
    "id": "colab-977",
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
    "id": "colab-990",
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
    "id": "colab-993",
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
    "id": "colab-994",
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
    "id": "colab-1009",
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
    "id": "colab-363",
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
    "id": "colab-234",
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
    "id": "colab-241",
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
    "id": "colab-249",
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
    "id": "colab-250",
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
    "id": "colab-255",
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
    "id": "colab-256",
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
    "id": "colab-294",
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
    "id": "colab-295",
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
    "id": "colab-313",
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
    "id": "colab-335",
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
    "id": "colab-336",
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
    "id": "colab-343",
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
    "id": "colab-344",
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
    "id": "colab-350",
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
    "id": "colab-356",
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
    "id": "colab-358",
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
    "id": "colab-360",
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
    "id": "colab-361",
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
    "id": "colab-364",
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
    "id": "colab-365",
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
    "id": "colab-1491",
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
    "id": "colab-1494",
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
      id: "aviso-1",
      titulo: "Fechamento da Folha e Ponto de Outubro 2026",
      conteudo: "Lembramos a todos os encarregados e gestores que as conferências de batidas faltantes, atestados e justificativas devem ser concluídas até o dia 28/10 para fechamento do espelho de ponto e apuração definitiva do Vale Alimentação.",
      categoria: "urgente",
      filialId: "TODAS",
      autor: "RH / Departamento Pessoal",
      fixado: true,
      createdAt: "2026-10-10T08:00:00Z"
    },
    {
      id: "aviso-2",
      titulo: "Obrigatoriedade das 4 Batidas Diárias e Tolerância",
      conteudo: "Reforçamos a necessidade de registrar todas as 4 batidas obrigatórias do expediente: Entrada Manhã (08:00), Saída Almoço (12:00), Retorno Almoço (13:00) e Saída Tarde (17:00). Lembramos que a tolerância do sistema é de 5 minutos por período (não cumulativa).",
      categoria: "importante",
      filialId: "branch-1",
      autor: "Gerência Administrativa",
      fixado: true,
      createdAt: "2026-10-11T09:30:00Z"
    },
    {
      id: "aviso-3",
      titulo: "Expediente Especial de Manutenção e Organização",
      conteudo: "Neste próximo sábado teremos expediente específico para alinhamento operacional e manutenção no depósito e maquinários. Os descansos e compensações serão integrados ao banco de horas e controle de DSR.",
      categoria: "expediente",
      filialId: "branch-2",
      autor: "Coordenação Operacional",
      fixado: false,
      createdAt: "2026-10-12T14:00:00Z"
    }
  ];

  const registrosPonto = {};
  const carryOverDsr = {};

  return { filiais, departamentos, colaboradores, feriados, avisos, registrosPonto, carryOverDsr };
}

// Salvar dados no LocalStorage e Sincronizar com a Nuvem Supabase
function saveStateToStorage(syncCloud = true) {
  try {
    const payload = {
      filiais: appState.filiais,
      departamentos: appState.departamentos,
      colaboradores: appState.colaboradores,
      feriados: appState.feriados,
      avisos: appState.avisos,
      registrosPonto: appState.registrosPonto,
      carryOverDsr: appState.carryOverDsr,
      activeBranchId: appState.activeBranchId,
      currentYear: appState.currentYear,
      currentMonth: appState.currentMonth,
      statusFilter: appState.statusFilter,
      focusMode: appState.focusMode,
      sortBy: appState.sortBy
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    if (syncCloud && supabaseClient) {
      triggerCloudSync(payload);
    }
  } catch (err) {
    console.error('Falha ao salvar no localStorage:', err);
  }
}

let cloudSyncTimer = null;
function triggerCloudSync(payload) {
  if (!supabaseClient) return;
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    try {
      const badge = document.getElementById('supabase-sync-badge');
      if (badge) badge.style.opacity = '0.5';

      await supabaseClient
        .from('config_app')
        .upsert({ id: 'latest_state', data: payload, updated_at: new Date().toISOString() });

      if (badge) {
        badge.style.opacity = '1';
        badge.title = 'Sincronizado com a nuvem: ' + new Date().toLocaleTimeString();
      }
    } catch (e) {
      console.warn('Erro na sincronização em nuvem:', e);
    }
  }, 1000);
}

async function syncFromCloudOnStart() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('config_app')
      .select('data, updated_at')
      .eq('id', 'latest_state')
      .maybeSingle();

    if (data && data.data) {
      const cloud = data.data;
      if (cloud.registrosPonto && Object.keys(cloud.registrosPonto).length > 0) {
        appState.registrosPonto = { ...appState.registrosPonto, ...cloud.registrosPonto };
      }
      if (cloud.carryOverDsr) {
        appState.carryOverDsr = { ...appState.carryOverDsr, ...cloud.carryOverDsr };
      }
      if (cloud.colaboradores && cloud.colaboradores.length > 0) {
        appState.colaboradores = cloud.colaboradores;
      }
      if (cloud.avisos && Array.isArray(cloud.avisos) && cloud.avisos.length > 0) {
        appState.avisos = cloud.avisos;
      }
      saveStateToStorage(false);
      renderCurrentView();
      console.log('Dados sincronizados do Supabase Cloud com sucesso.');
    }
  } catch (e) {
    console.warn('Falha ao sincronizar da nuvem:', e);
  }
}

// Carregar dados
function loadStateFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.filiais && parsed.filiais.length > 0 && parsed.colaboradores && parsed.colaboradores.length > 0) {
        appState.filiais = parsed.filiais;
        appState.departamentos = parsed.departamentos || [];
        appState.colaboradores = (parsed.colaboradores || []).map(c => ({
          ...c,
          registraPonto: c.registraPonto !== false,
          status: c.status || 'ativo',
          dataDemissao: c.dataDemissao || ''
        }));
        appState.feriados = parsed.feriados || [];
        appState.avisos = (parsed.avisos && Array.isArray(parsed.avisos) && parsed.avisos.length > 0)
          ? parsed.avisos
          : getDefaultSeedData().avisos;
        appState.registrosPonto = parsed.registrosPonto || {};
        appState.carryOverDsr = parsed.carryOverDsr || {};

        if (parsed.activeBranchId && appState.filiais.some(f => f.id === parsed.activeBranchId)) {
          appState.activeBranchId = parsed.activeBranchId;
        } else {
          appState.activeBranchId = appState.filiais[0].id;
        }

        if (typeof parsed.currentYear === 'number') appState.currentYear = parsed.currentYear;
        if (typeof parsed.currentMonth === 'number') appState.currentMonth = parsed.currentMonth;
        if (parsed.statusFilter) appState.statusFilter = parsed.statusFilter;
        if (typeof parsed.focusMode === 'boolean') appState.focusMode = parsed.focusMode;
        if (parsed.sortBy) appState.sortBy = parsed.sortBy;
        return;
      }
    }
  } catch (err) {
    console.warn('Erro ao ler do storage, carregando seed real:', err);
  }

  // Se não existir dados ou forem antigos/inválidos, carrega a base enviada
  const seed = getDefaultSeedData();
  appState.filiais = seed.filiais;
  appState.departamentos = seed.departamentos;
  appState.colaboradores = seed.colaboradores;
  appState.feriados = seed.feriados;
  appState.avisos = seed.avisos;
  appState.registrosPonto = seed.registrosPonto;
  appState.carryOverDsr = seed.carryOverDsr;
  appState.activeBranchId = 'branch-1';
  saveStateToStorage();
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
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  if (mins === null || isNaN(mins)) return '--:--';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/**
 * Avaliação Diária por Batidas:
 * Horários de Referência Padrão:
 *   EM (08:00), SM (12:00), ET (13:00), ST (17:00)
 * Regra de Tolerância: 5 minutos de tolerância por período (não cumulativa).
 */
function evaluateDailyPunches(punches) {
  const refEM = 8 * 60;   // 08:00
  const refSM = 12 * 60;  // 12:00
  const refET = 13 * 60;  // 13:00
  const refST = 17 * 60;  // 17:00

  const pEM = timeToMinutes(punches.em);
  const pSM = timeToMinutes(punches.sm);
  const pET = timeToMinutes(punches.et);
  const pST = timeToMinutes(punches.st);

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

  // Tarde
  if (pET !== null && pET > refET) {
    const diff = pET - refET;
    if (diff > 5) atrasoTarde += diff;
  }
  if (pST !== null && pST < refST) {
    const diff = refST - pST;
    if (diff > 5) atrasoTarde += diff;
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
  if (dayOfWeek === 0) {
    return {
      type: 'DOMINGO',
      display: 'DOMINGO',
      cssClass: 'status-domingo',
      isPending: false,
      isWorkingDay: false,
      isSunday: true,
      isHoliday: false
    };
  }

  // Verificar feriado
  const holiday = isHoliday(isoStr, branchId);
  const regKey = colabId + '_' + isoStr;
  const reg = appState.registrosPonto[regKey];

  // Se houver override manual
  if (reg && reg.override && reg.override !== 'AUTO') {
    const override = reg.override;
    const resolution = reg.resolution || 'NENHUMA';

    if (override === 'OK' || resolution === 'ABONAR') {
      return {
        type: 'OK',
        display: 'OK',
        cssClass: 'status-ok',
        isPending: false,
        isWorkingDay: !holiday,
        isSunday: false,
        isHoliday: !!holiday,
        holidayName: holiday ? holiday.nome : undefined,
        resolution
      };
    }

    if (override === 'FALTA') {
      return {
        type: 'FALTA',
        display: 'FALTA',
        cssClass: 'status-falta',
        isPending: true,
        isWorkingDay: true,
        isSunday: false,
        isHoliday: !!holiday,
        resolution
      };
    }

    if (override === 'FM' || override === 'FT') {
      return {
        type: override,
        display: override,
        cssClass: 'status-half',
        isPending: true,
        isWorkingDay: true,
        isSunday: false,
        isHoliday: !!holiday,
        resolution
      };
    }

    if (override === 'ATESTADO' || override === '1/2 ATESTADO') {
      return {
        type: override,
        display: override === '1/2 ATESTADO' ? '½ AT' : 'AT',
        cssClass: 'status-atestado',
        isPending: true,
        isWorkingDay: true,
        isSunday: false,
        isHoliday: !!holiday,
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
        isHoliday: !!holiday,
        resolution
      };
    }
  }

  // Se for feriado e não houve falta/override
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

  // Avaliação por Batidas
  if (reg && reg.punches) {
    const evalResult = evaluateDailyPunches(reg.punches);
    if (evalResult.status === 'ATRASO') {
      if (reg.resolution === 'ABONAR') {
        return {
          type: 'OK',
          display: 'OK',
          cssClass: 'status-ok',
          isPending: false,
          isWorkingDay: true,
          isSunday: false,
          isHoliday: false,
          resolution: 'ABONAR'
        };
      }
      return {
        type: 'ATRASO',
        display: evalResult.delayText,
        cssClass: 'status-atraso',
        isPending: true,
        isWorkingDay: true,
        isSunday: false,
        isHoliday: false,
        delayMinutes: evalResult.delayMinutes,
        resolution: reg.resolution || 'NENHUMA'
      };
    }
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

  // Carry-over do mês anterior
  const carryKey = colabId + '_' + year + '-' + String(month + 1).padStart(2, '0');
  const carriedFromPrev = appState.carryOverDsr[carryKey] || 0;
  if (carriedFromPrev > 0) {
    totalDsrLost += carriedFromPrev;
    breakdown.push('+' + carriedFromPrev + ' DSR transferido do fechamento do mês anterior');
  }

  let currentWeekDays = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const isoStr = formatDateISO(year, month, d);
    const dateObj = new Date(isoStr + 'T12:00:00');
    const dayOfWeek = dateObj.getDay();

    currentWeekDays.push({ isoStr, dayOfWeek, dayNum: d });

    if (dayOfWeek === 0 || d === daysInMonth) {
      let hasUnjustifiedAbsence = false;
      let holidaysInWeek = 0;

      for (const day of currentWeekDays) {
        const resolved = getResolvedDayStatus(colabId, day.isoStr, branchId);
        if (resolved.type === 'FALTA' && resolved.resolution !== 'ABONAR') {
          hasUnjustifiedAbsence = true;
        }
        if (resolved.isHoliday) {
          holidaysInWeek++;
        }
      }

      if (hasUnjustifiedAbsence) {
        if (d === daysInMonth && dayOfWeek !== 0) {
          const nextDate = new Date(year, month + 1, 1);
          const nextYear = nextDate.getFullYear();
          const nextMonth = nextDate.getMonth();
          const nextCarryKey = colabId + '_' + nextYear + '-' + String(nextMonth + 1).padStart(2, '0');
          
          let penalty = 1 + holidaysInWeek;
          appState.carryOverDsr[nextCarryKey] = (appState.carryOverDsr[nextCarryKey] || 0) + penalty;
          breakdown.push('Semana final incompleta: ' + penalty + ' DSR transferido para ' + MESES_PT[nextMonth] + '/' + nextYear);
        } else {
          let penalty = 1;
          if (holidaysInWeek > 0) {
            penalty += holidaysInWeek;
          }
          totalDsrLost += penalty;
          breakdown.push('Semana finalizada em ' + formatDateBR(currentWeekDays[currentWeekDays.length - 1].isoStr) + ': -' + penalty + ' DSR (' + (holidaysInWeek > 0 ? 'Falta + Feriado' : 'Falta semanal') + ')');
        }
      }

      currentWeekDays = [];
    }
  }

  return { totalDsrLost, breakdown };
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

  for (let d = 1; d <= daysInMonth; d++) {
    const isoStr = formatDateISO(year, month, d);
    const dateObj = new Date(isoStr + 'T12:00:00');
    const dayOfWeek = dateObj.getDay();
    const dayOfWeekName = DIAS_SEMANA_SIGLA[dayOfWeek];
    const holiday = isHoliday(isoStr, branchId);

    const isSunday = dayOfWeek === 0;
    const isHolidayDay = !!holiday;
    const isStandardBusinessDay = !isSunday && !isHolidayDay;

    // Verificação de período de vigência contratual
    const isBeforeAdmission = colab && colab.admissao && isoStr < colab.admissao;
    const isAfterDismissal = isDemitido && isoStr > colab.dataDemissao;

    let creditado = 0;
    let descontado = 0;
    let note = '';
    let resolvedDisplay = '';

    if (!isStandardBusinessDay) {
      resolvedDisplay = isSunday ? 'DOMINGO' : 'FERIADO';
      note = isSunday ? 'Domingo (Sem VA)' : ('Feriado: ' + holiday.nome);
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
        // NÃO REGISTRA PONTO: crédito integral máximo conforme dias úteis
        creditado = 8.00;
        descontado = 0.00;
        fullDaysWorked++;
        resolvedDisplay = 'INTEGRAL';
        note = 'Crédito integral (Isento de registro de ponto)';
      } else {
        const resolved = getResolvedDayStatus(colabId, isoStr, branchId);
        resolvedDisplay = resolved.display;

        if (resolved.type === 'OK') {
          creditado = 8.00;
          descontado = 0.00;
          fullDaysWorked++;
          note = 'Dia integral trabalhado';
        } else if (resolved.type === 'FM' || resolved.type === 'FT' || resolved.type === '1/2 ATESTADO') {
          creditado = 4.00;
          descontado = 4.00;
          halfDaysWorked++;
          note = 'Meio período (' + resolved.type + ') - Desconto R$ 4,00';
        } else if (resolved.type === 'ATRASO') {
          if (resolved.resolution === 'DESCONTAR_VA' || resolved.resolution === 'DESCONTAR_AMBOS') {
            creditado = 4.00;
            descontado = 4.00;
            note = 'Atraso com desconto em VA (' + resolved.display + ')';
          } else {
            creditado = 8.00;
            descontado = 0.00;
            fullDaysWorked++;
            note = 'Atraso com VA mantido (' + resolved.display + ')';
          }
        } else if (resolved.type === 'FALTA' || resolved.type === 'ATESTADO') {
          creditado = 0.00;
          descontado = 8.00;
          absenceDays++;
          note = resolved.type + ' - Desconto integral de R$ 8,00';
        } else if (resolved.type === 'FÉRIAS' || resolved.type === 'AFASTADO') {
          creditado = 0.00;
          descontado = 8.00;
          absenceDays++;
          note = resolved.type + ' - Sem benefício de VA';
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

  const potencialMaximo = totalBusinessDays * 8.00;

  return {
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
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    if (btn.dataset.view === targetView) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.app-view').forEach(view => {
    view.style.display = (view.id === targetView) ? 'block' : 'none';
  });

  // Toolbar visibilidade (apenas ponto e va utilizam a toolbar global)
  const toolbar = document.getElementById('main-toolbar');
  const boxFilterStatus = document.getElementById('box-filter-status');
  if (targetView === 'view-ponto' || targetView === 'view-va') {
    if (toolbar) toolbar.style.display = 'flex';
    if (boxFilterStatus) boxFilterStatus.style.display = 'flex';
  } else {
    if (toolbar) toolbar.style.display = 'none';
  }
}

function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-tab-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.view;
      appState.activeView = targetView;
      updateNavTabsActive(targetView);
      renderCurrentView();
    });
  });
}

function renderCurrentView() {
  renderBranchTabs();
  updateMonthDisplay();

  if (appState.activeView === 'view-avisos') {
    renderAvisosView();
  } else if (appState.activeView === 'view-ponto') {
    renderMatrixView();
    updatePontoUrgentBanner();
  } else if (appState.activeView === 'view-va') {
    renderVAView();
  } else if (appState.activeView === 'view-colaboradores') {
    renderColaboradoresView();
  } else if (appState.activeView === 'view-estrutura') {
    renderEstruturaView();
  } else if (appState.activeView === 'view-feriados') {
    renderFeriadosView();
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
      // Se estava em tela global e clicou na filial, vai para o mural ou mantém e marca
      if (appState.activeView === 'view-estrutura' || appState.activeView === 'view-feriados') {
        appState.activeView = 'view-avisos';
        updateNavTabsActive('view-avisos');
      }
      saveStateToStorage();
      renderCurrentView();
      showToast('Filial selecionada: ' + branch.nome, 'info');
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

  // Filtro de Ponto
  if (isForPonto) {
    // 1. Quem NÃO registra ponto não aparece na matriz de ponto
    list = list.filter(c => c.registraPonto !== false);

    // 2. Filtro de Situação (Ativos / Demitidos / Todos)
    const stFilter = appState.statusFilter || 'ativos';
    if (stFilter === 'ativos') {
      list = list.filter(c => c.status !== 'demitido');
    } else if (stFilter === 'demitidos') {
      list = list.filter(c => c.status === 'demitido');
    }
  } else {
    // No Vale Alimentação: respeita o filtro de situação se selecionado 'demitidos'
    const stFilter = appState.statusFilter || 'ativos';
    if (stFilter === 'demitidos') {
      list = list.filter(c => c.status === 'demitido');
    } else if (stFilter === 'ativos') {
      // Ativos + quem foi demitido dentro do mês corrente (para apuração dos dias trabalhados)
      const monthStart = formatDateISO(appState.currentYear, appState.currentMonth, 1);
      list = list.filter(c => c.status !== 'demitido' || (c.dataDemissao && c.dataDemissao >= monthStart));
    }
  }

  // Filtro de busca textual
  if (appState.searchFilter.trim()) {
    const q = appState.searchFilter.toLowerCase();
    list = list.filter(c => 
      c.nome.toLowerCase().includes(q) ||
      String(c.cracha).includes(q)
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

  if (appState.sortBy === 'cracha') {
    list.sort((a, b) => Number(a.cracha) - Number(b.cracha));
  } else if (appState.sortBy === 'nome') {
    list.sort((a, b) => a.nome.localeCompare(b.nome));
  } else if (appState.sortBy === 'data_admissao') {
    list.sort((a, b) => new Date(a.admissao) - new Date(b.admissao));
  } else if (appState.sortBy === 'departamento') {
    list.sort((a, b) => {
      const deptA = deptMap[a.deptId] || '';
      const deptB = deptMap[b.deptId] || '';
      const compDept = deptA.localeCompare(deptB);
      if (compDept !== 0) return compDept;
      return Number(a.cracha) - Number(b.cracha);
    });
  }

  return list;
}

// ==========================================================================
// 5. RENDERIZAÇÃO DA MATRIZ DE PONTO (DASHBOARD PRINCIPAL)
// ==========================================================================
function renderMatrixView() {
  const thead = document.getElementById('matrix-thead');
  const tbody = document.getElementById('matrix-tbody');
  if (!thead || !tbody) return;

  const year = appState.currentYear;
  const month = appState.currentMonth;
  const daysInMonth = getDaysInMonth(year, month);
  const deptMap = Object.fromEntries(appState.departamentos.map(d => [d.id, d.nome]));
  const employees = getFilteredAndSortedEmployees(true);

  // Construção do Cabeçalho Duplo
  let row1 = '<tr><th class="col-dept" rowspan="2">Departamento</th><th class="col-badge" rowspan="2">Crachá</th><th class="col-name" rowspan="2">Colaborador</th>';
  let row2 = '<tr>';

  for (let d = 1; d <= daysInMonth; d++) {
    const isoStr = formatDateISO(year, month, d);
    const dateObj = new Date(isoStr + 'T12:00:00');
    const dayOfWeek = dateObj.getDay();
    const dayOfWeekName = DIAS_SEMANA_SIGLA[dayOfWeek];
    const isSunday = dayOfWeek === 0;
    const holiday = isHoliday(isoStr, appState.activeBranchId);

    let thClass = 'th-date-clickable';
    let titleHint = "Clique no dia " + String(d).padStart(2, '0') + " para aplicar 'OK' em massa para todos";

    if (isSunday) {
      thClass += ' th-sunday';
      titleHint = 'Domingo (DSR Automático)';
    } else if (holiday) {
      thClass += ' th-feriado';
      titleHint = 'Feriado: ' + holiday.nome;
    }

    const dayNumStr = String(d).padStart(2, '0');
    row1 += '<th class="' + thClass + '" data-date="' + isoStr + '" data-sunday="' + (isSunday ? '1' : '0') + '" title="' + titleHint + '">' + dayNumStr + '</th>';
    row2 += '<th class="' + (isSunday ? 'th-sunday' : (holiday ? 'th-feriado' : '')) + '">' + dayOfWeekName + '</th>';
  }

  row1 += '<th class="col-dsr" rowspan="2" title="Total de DSRs perdidos/descontados no mês">Qtd. DSR</th></tr>';
  row2 += '</tr>';

  thead.innerHTML = row1 + row2;

  // Ouvintes de clique nos dias do cabeçalho (Ação em Massa por Data)
  thead.querySelectorAll('.th-date-clickable').forEach(th => {
    th.addEventListener('click', () => {
      const isSunday = th.dataset.sunday === '1';
      if (isSunday) return;
      const isoDate = th.dataset.date;
      openMassOverrideModal(isoDate);
    });
  });

  // Construção do Corpo da Tabela
  tbody.innerHTML = '';

  if (employees.length === 0) {
    const totalCols = daysInMonth + 4;
    tbody.innerHTML = '<tr><td colspan="' + totalCols + '" class="empty-state"><div class="empty-state-icon">📋</div><p>Nenhum colaborador encontrado com os filtros atuais nesta filial.</p></td></tr>';
    return;
  }

  employees.forEach(colab => {
    const deptName = deptMap[colab.deptId] || 'Geral';
    const tr = document.createElement('tr');

    let html = '<td class="col-dept" title="' + deptName + '">' + deptName + '</td><td class="col-badge">' + colab.cracha + '</td><td class="col-name" title="' + colab.nome + '">' + colab.nome + '</td>';

    // Células de Dias
    for (let d = 1; d <= daysInMonth; d++) {
      const isoStr = formatDateISO(year, month, d);
      const resolved = getResolvedDayStatus(colab.id, isoStr, appState.activeBranchId);

      html += '<td><div class="cell-ponto ' + resolved.cssClass + '" data-colab-id="' + colab.id + '" data-colab-name="' + colab.nome + '" data-date="' + isoStr + '" data-sunday="' + (resolved.isSunday ? '1' : '0') + '" data-disabled="' + (resolved.isDisabled ? '1' : '0') + '" data-dismissed="' + (resolved.isDismissed ? '1' : '0') + '" title="' + colab.nome + ' - ' + formatDateBR(isoStr) + ': ' + resolved.display + (resolved.holidayName ? ' (' + resolved.holidayName + ')' : '') + '">' + resolved.display + '</div></td>';
    }

    // Coluna Congelada à Direita: Qtd. DSR
    const dsrInfo = calculateDsrForEmployee(colab.id, year, month, appState.activeBranchId);
    const dsrClass = dsrInfo.totalDsrLost > 0 ? 'dsr-penalty' : 'dsr-zero';
    const dsrTooltip = dsrInfo.breakdown.length > 0 ? dsrInfo.breakdown.join('&#10;') : 'Nenhuma perda de DSR no mês';

    html += '<td class="col-dsr" title="' + dsrTooltip + '"><span class="dsr-badge ' + dsrClass + '">' + dsrInfo.totalDsrLost + '</span></td>';

    tr.innerHTML = html;
    tbody.appendChild(tr);
  });

  // Cliques nas células individuais de ponto
  tbody.querySelectorAll('.cell-ponto').forEach(cell => {
    cell.addEventListener('click', () => {
      if (cell.dataset.sunday === '1') {
        showToast('Domingos são de descanso obrigatório (DSR) e não permitem alteração manual.', 'info');
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
      const colabId = cell.dataset.colabId;
      const isoDate = cell.dataset.date;
      openCellDetailModal(colabId, isoDate);
    });
  });
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
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><div class="empty-state-icon">💳</div><p>Nenhum colaborador encontrado para fechamento de VA nesta filial.</p></td></tr>';
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

  const summary = document.getElementById('va-audit-summary');
  summary.innerHTML = '<div><strong style="color:var(--color-cyan); font-size:14px;">' + colab.nome + '</strong> (Crachá: ' + colab.cracha + ')<div style="font-size:11px; color:var(--color-text-sub);">Setor: ' + (deptMap[colab.deptId] || '') + ' • Mês: ' + MESES_PT[appState.currentMonth] + '/' + appState.currentYear + (colab.status === 'demitido' ? ' • Desligado em: ' + formatDateBR(colab.dataDemissao) : '') + '</div></div><div style="text-align:right;"><span style="font-size:11px; color:var(--color-text-muted);">Líquido a Pagar:</span><div style="color:var(--color-cyan); font-family:var(--font-mono); font-size:16px; font-weight:700;">R$ ' + va.valorLiquido.toFixed(2).replace('.', ',') + '</div><div style="font-size:10px; color:#B4A6CF;">Descontos: R$ ' + va.valorDescontado.toFixed(2).replace('.', ',') + '</div></div>';

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
  const desc = document.getElementById('mass-modal-desc');
  desc.innerHTML = 'Deseja definir o status como <strong>"OK"</strong> para <strong>TODOS</strong> os colaboradores que registram ponto na filial <em>"' + branchName + '"</em> no dia <strong>' + formatDateBR(isoDate) + '</strong>?';
  openModal('modal-mass-override');
}

document.getElementById('btn-confirm-mass-ok')?.addEventListener('click', () => {
  if (!activeMassDate) return;

  const branchEmployees = appState.colaboradores.filter(c => c.filialId === appState.activeBranchId);
  branchEmployees.forEach(colab => {
    if (colab.registraPonto === false) return;
    if (colab.status === 'demitido' && colab.dataDemissao && activeMassDate > colab.dataDemissao) return;
    if (colab.admissao && activeMassDate < colab.admissao) return;

    const regKey = colab.id + '_' + activeMassDate;
    appState.registrosPonto[regKey] = {
      override: 'OK',
      resolution: 'ABONAR',
      punches: { em: '08:00', sm: '12:00', et: '13:00', st: '17:00' },
      note: 'Abono/OK em massa pelo cabeçalho da data'
    };
  });

  saveStateToStorage();
  closeModal('modal-mass-override');
  renderCurrentView();
  showToast('Status definido como "OK" para todos os colaboradores em ' + formatDateBR(activeMassDate), 'success');
});

let currentEditingCell = { colabId: null, isoDate: null };

function openCellDetailModal(colabId, isoDate) {
  currentEditingCell = { colabId, isoDate };

  const colab = appState.colaboradores.find(c => c.id === colabId);
  if (!colab) return;

  const branch = appState.filiais.find(f => f.id === colab.filialId);
  const dept = appState.departamentos.find(d => d.id === colab.deptId);
  const dateObj = new Date(isoDate + 'T12:00:00');
  const dayOfWeekName = DIAS_SEMANA_SIGLA[dateObj.getDay()];

  document.getElementById('modal-colab-name').textContent = colab.nome;
  document.getElementById('modal-colab-sub').textContent = 'Crachá: ' + colab.cracha + ' • Depto: ' + (dept ? dept.nome : '') + ' • Filial: ' + (branch ? branch.nome : '');
  document.getElementById('modal-date-display').textContent = formatDateBR(isoDate) + ' (' + dayOfWeekName + ')';

  const regKey = colabId + '_' + isoDate;
  const reg = appState.registrosPonto[regKey] || {
    override: 'AUTO',
    resolution: 'NENHUMA',
    punches: { em: '08:00', sm: '12:00', et: '13:00', st: '17:00' },
    note: ''
  };

  document.getElementById('punch-em').value = reg.punches?.em || '';
  document.getElementById('punch-sm').value = reg.punches?.sm || '';
  document.getElementById('punch-et').value = reg.punches?.et || '';
  document.getElementById('punch-st').value = reg.punches?.st || '';

  document.getElementById('select-override-status').value = reg.override || 'AUTO';
  document.getElementById('select-resolution').value = reg.resolution || 'NENHUMA';
  document.getElementById('input-cell-justificativa').value = reg.note || '';

  const currentStatus = getDayStatus(colabId, isoDate, appState.activeBranchId);
  document.getElementById('modal-status-badge').textContent = 'Status Apurado: ' + currentStatus.display;

  document.getElementById('check-replicate-days').checked = false;
  document.getElementById('input-replicate-count').value = 1;

  openModal('modal-cell-detail');
}

document.getElementById('btn-save-cell-detail')?.addEventListener('click', () => {
  const { colabId, isoDate } = currentEditingCell;
  if (!colabId || !isoDate) return;

  const colab = appState.colaboradores.find(c => c.id === colabId);

  const override = document.getElementById('select-override-status').value;
  const resolution = document.getElementById('select-resolution').value;
  const note = document.getElementById('input-cell-justificativa').value.trim();

  const punches = {
    em: document.getElementById('punch-em').value,
    sm: document.getElementById('punch-sm').value,
    et: document.getElementById('punch-et').value,
    st: document.getElementById('punch-st').value
  };

  const regKey = colabId + '_' + isoDate;
  appState.registrosPonto[regKey] = {
    override,
    resolution,
    punches,
    note
  };

  // Replicação para os próximos dias
  const shouldReplicate = document.getElementById('check-replicate-days').checked;
  const replicateCount = parseInt(document.getElementById('input-replicate-count').value, 10) || 1;

  if (shouldReplicate && replicateCount > 0) {
    const curDate = new Date(isoDate + 'T12:00:00');
    let added = 0;

    for (let i = 1; added < replicateCount && i <= 40; i++) {
      const nextDate = new Date(curDate);
      nextDate.setDate(curDate.getDate() + i);

      // Pula domingos
      if (nextDate.getDay() === 0) continue;

      const nextIso = nextDate.toISOString().split('T')[0];

      // Pula dias após demissão
      if (colab && colab.status === 'demitido' && colab.dataDemissao && nextIso > colab.dataDemissao) continue;

      const nextKey = colabId + '_' + nextIso;
      appState.registrosPonto[nextKey] = {
        override,
        resolution,
        punches: { ...punches },
        note: note + ' (Replicado de ' + formatDateBR(isoDate) + ')'
      };
      added++;
    }
  }

  saveStateToStorage();
  closeModal('modal-cell-detail');
  renderCurrentView();
  showToast('Registro de ponto atualizado com sucesso!', 'success');
});

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

function renderAvisosView() {
  const currentBranch = appState.filiais.find(f => f.id === appState.activeBranchId);
  const branchName = currentBranch ? currentBranch.nome : 'Todas as Filiais';
  
  const branchIndicator = document.getElementById('avisos-branch-indicator');
  if (branchIndicator) {
    branchIndicator.innerHTML = `📍 Exibindo comunicados de: <strong>${escapeHtml(branchName)}</strong>`;
  }

  const kpiBranchName = document.getElementById('kpi-avisos-filial-name');
  if (kpiBranchName) {
    kpiBranchName.textContent = currentBranch ? (currentBranch.cidade || currentBranch.nome) : 'Filial Ativa';
  }

  // Estatísticas / KPIs
  const allAvisos = appState.avisos || [];
  const urgentes = allAvisos.filter(a => a.categoria === 'urgente');
  const daFilial = allAvisos.filter(a => a.filialId === appState.activeBranchId);
  const gerais = allAvisos.filter(a => a.filialId === 'TODAS' || !a.filialId);

  const kpiTotal = document.getElementById('kpi-avisos-total');
  const kpiUrgentes = document.getElementById('kpi-avisos-urgentes');
  const kpiFilial = document.getElementById('kpi-avisos-filial');
  const kpiGerais = document.getElementById('kpi-avisos-gerais');

  if (kpiTotal) kpiTotal.textContent = allAvisos.length;
  if (kpiUrgentes) kpiUrgentes.textContent = urgentes.length;
  if (kpiFilial) kpiFilial.textContent = daFilial.length;
  if (kpiGerais) kpiGerais.textContent = gerais.length;

  // Filtragem
  const searchInput = document.getElementById('avisos-search-input');
  const search = (searchInput?.value || '').trim().toLowerCase();
  const catFilter = document.getElementById('avisos-filter-categoria')?.value || 'todas';
  const escopoFilter = document.getElementById('avisos-filter-escopo')?.value || 'todos';

  let filtered = allAvisos.filter(aviso => {
    // Destino / Escopo
    if (escopoFilter === 'filial' && aviso.filialId !== appState.activeBranchId) return false;
    if (escopoFilter === 'geral' && (aviso.filialId && aviso.filialId !== 'TODAS')) return false;
    if (escopoFilter === 'todos') {
      if (aviso.filialId && aviso.filialId !== 'TODAS' && aviso.filialId !== appState.activeBranchId) {
        return false;
      }
    }

    // Categoria
    if (catFilter !== 'todas' && aviso.categoria !== catFilter) return false;

    // Busca textual
    if (search) {
      const matchTitle = (aviso.titulo || '').toLowerCase().includes(search);
      const matchContent = (aviso.conteudo || '').toLowerCase().includes(search);
      const matchAutor = (aviso.autor || '').toLowerCase().includes(search);
      if (!matchTitle && !matchContent && !matchAutor) return false;
    }

    return true;
  });

  // Ordenação: Fixados no topo, depois data descrescente
  filtered.sort((a, b) => {
    if (a.fixado && !b.fixado) return -1;
    if (!a.fixado && b.fixado) return 1;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  const pinnedList = filtered.filter(a => a.fixado);
  const normalList = filtered.filter(a => !a.fixado);

  const pinnedSection = document.getElementById('avisos-pinned-section');
  const pinnedGrid = document.getElementById('avisos-pinned-grid');
  const cardsGrid = document.getElementById('avisos-cards-grid');
  const emptyState = document.getElementById('avisos-empty-state');

  if (pinnedList.length > 0) {
    if (pinnedSection) pinnedSection.style.display = 'block';
    if (pinnedGrid) pinnedGrid.innerHTML = pinnedList.map(a => renderAvisoCardHtml(a)).join('');
  } else {
    if (pinnedSection) pinnedSection.style.display = 'none';
    if (pinnedGrid) pinnedGrid.innerHTML = '';
  }

  if (normalList.length > 0) {
    if (cardsGrid) {
      cardsGrid.style.display = 'grid';
      cardsGrid.innerHTML = normalList.map(a => renderAvisoCardHtml(a)).join('');
    }
    if (emptyState) emptyState.style.display = 'none';
  } else if (pinnedList.length > 0) {
    if (cardsGrid) {
      cardsGrid.style.display = 'none';
      cardsGrid.innerHTML = '';
    }
    if (emptyState) emptyState.style.display = 'none';
  } else {
    if (cardsGrid) {
      cardsGrid.style.display = 'none';
      cardsGrid.innerHTML = '';
    }
    if (emptyState) emptyState.style.display = 'block';
  }

  // Eventos dos cards
  document.querySelectorAll('.btn-toggle-pin-aviso').forEach(b => {
    b.addEventListener('click', () => togglePinAviso(b.dataset.id));
  });
  document.querySelectorAll('.btn-edit-aviso').forEach(b => {
    b.addEventListener('click', () => openAvisoModal(b.dataset.id));
  });
  document.querySelectorAll('.btn-delete-aviso').forEach(b => {
    b.addEventListener('click', () => deleteAviso(b.dataset.id));
  });
}

function renderAvisoCardHtml(aviso) {
  const branchMap = Object.fromEntries(appState.filiais.map(f => [f.id, f.nome]));
  const scopeLabel = (!aviso.filialId || aviso.filialId === 'TODAS')
    ? '🌐 Todas as Filiais'
    : '🏢 ' + (branchMap[aviso.filialId] || 'Filial Específica');

  let catLabel = '🔵 Informativo';
  let catClass = 'badge-cat-informativo';
  if (aviso.categoria === 'urgente') {
    catLabel = '🔴 Urgente';
    catClass = 'badge-cat-urgente';
  } else if (aviso.categoria === 'importante') {
    catLabel = '🟡 Importante';
    catClass = 'badge-cat-importante';
  } else if (aviso.categoria === 'expediente') {
    catLabel = '🟣 Expediente / Feriado';
    catClass = 'badge-cat-expediente';
  }

  const dateStr = aviso.createdAt ? formatDateTimeBR(aviso.createdAt) : 'Data recente';
  const pinTitle = aviso.fixado ? 'Desafixar do Topo' : 'Fixar no Topo';
  const pinBtnText = aviso.fixado ? '📌 Desafixar' : '📌 Fixar';

  return `
    <div class="aviso-card ${aviso.fixado ? 'pinned' : ''} ${aviso.categoria === 'urgente' ? 'urgente' : ''}">
      <div>
        <div class="aviso-card-top">
          <div class="aviso-badges-wrap">
            <span class="badge-aviso-cat ${catClass}">${catLabel}</span>
            <span class="badge-aviso-scope">${scopeLabel}</span>
            ${aviso.fixado ? '<span class="badge-aviso-pin">📌 Fixado</span>' : ''}
          </div>
        </div>
        <h3 class="aviso-card-title">${escapeHtml(aviso.titulo)}</h3>
        <div class="aviso-card-meta">
          <span>📅 ${dateStr}</span>
          <span>•</span>
          <span>✍️ ${escapeHtml(aviso.autor || 'RH')}</span>
        </div>
        <div class="aviso-card-content">${escapeHtml(aviso.conteudo)}</div>
      </div>
      <div class="aviso-card-footer">
        <button class="btn btn-secondary btn-sm btn-toggle-pin-aviso" data-id="${aviso.id}" title="${pinTitle}">${pinBtnText}</button>
        <div class="aviso-card-actions">
          <button class="btn btn-secondary btn-sm btn-edit-aviso" data-id="${aviso.id}" title="Editar Comunicado">✏️ Editar</button>
          <button class="btn btn-danger btn-sm btn-delete-aviso" data-id="${aviso.id}" title="Excluir Comunicado">🗑️</button>
        </div>
      </div>
    </div>
  `;
}

function togglePinAviso(avisoId) {
  const aviso = (appState.avisos || []).find(a => a.id === avisoId);
  if (!aviso) return;
  aviso.fixado = !aviso.fixado;
  aviso.updatedAt = new Date().toISOString();
  saveStateToStorage();
  renderAvisosView();
  showToast(aviso.fixado ? 'Aviso fixado no topo do mural!' : 'Aviso desafixado.', 'info');
}

function openAvisoModal(avisoId = null) {
  const idInput = document.getElementById('aviso-edit-id');
  const tituloInput = document.getElementById('aviso-titulo');
  const catInput = document.getElementById('aviso-categoria');
  const filialSelect = document.getElementById('aviso-filial');
  const autorInput = document.getElementById('aviso-autor');
  const fixadoInput = document.getElementById('aviso-fixado');
  const conteudoInput = document.getElementById('aviso-conteudo');
  const titleHeader = document.getElementById('modal-aviso-title');

  if (!filialSelect) return;

  filialSelect.innerHTML = '<option value="TODAS">🌐 Todas as Filiais (Geral da Empresa)</option>' +
    appState.filiais.map(f => `<option value="${f.id}">🏢 ${f.nome}</option>`).join('');

  if (avisoId) {
    const aviso = (appState.avisos || []).find(a => a.id === avisoId);
    if (!aviso) return;
    idInput.value = aviso.id;
    tituloInput.value = aviso.titulo || '';
    catInput.value = aviso.categoria || 'informativo';
    filialSelect.value = aviso.filialId || 'TODAS';
    autorInput.value = aviso.autor || 'RH / Departamento Pessoal';
    fixadoInput.checked = !!aviso.fixado;
    conteudoInput.value = aviso.conteudo || '';
    if (titleHeader) titleHeader.innerHTML = '<span>✏️</span> Editar Comunicado';
  } else {
    idInput.value = '';
    tituloInput.value = '';
    catInput.value = 'informativo';
    filialSelect.value = appState.activeBranchId || 'TODAS';
    autorInput.value = 'RH / Departamento Pessoal';
    fixadoInput.checked = false;
    conteudoInput.value = '';
    if (titleHeader) titleHeader.innerHTML = '<span>📢</span> Novo Comunicado / Aviso';
  }

  openModal('modal-aviso');
}

function saveAvisoFromModal() {
  const idInput = document.getElementById('aviso-edit-id');
  const tituloInput = document.getElementById('aviso-titulo');
  const catInput = document.getElementById('aviso-categoria');
  const filialSelect = document.getElementById('aviso-filial');
  const autorInput = document.getElementById('aviso-autor');
  const fixadoInput = document.getElementById('aviso-fixado');
  const conteudoInput = document.getElementById('aviso-conteudo');

  const titulo = tituloInput.value.trim();
  const conteudo = conteudoInput.value.trim();

  if (!titulo) {
    showToast('Por favor, informe o título do comunicado.', 'warning');
    tituloInput.focus();
    return;
  }
  if (!conteudo) {
    showToast('Por favor, informe a mensagem do comunicado.', 'warning');
    conteudoInput.focus();
    return;
  }

  if (!appState.avisos) appState.avisos = [];

  const avisoId = idInput.value;
  if (avisoId) {
    const idx = appState.avisos.findIndex(a => a.id === avisoId);
    if (idx !== -1) {
      appState.avisos[idx] = {
        ...appState.avisos[idx],
        titulo,
        categoria: catInput.value,
        filialId: filialSelect.value,
        autor: autorInput.value.trim() || 'RH / Departamento Pessoal',
        fixado: fixadoInput.checked,
        conteudo,
        updatedAt: new Date().toISOString()
      };
      showToast('Comunicado atualizado com sucesso!', 'success');
    }
  } else {
    const newAviso = {
      id: 'aviso-' + Date.now(),
      titulo,
      categoria: catInput.value,
      filialId: filialSelect.value,
      autor: autorInput.value.trim() || 'RH / Departamento Pessoal',
      fixado: fixadoInput.checked,
      conteudo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    appState.avisos.unshift(newAviso);
    showToast('Novo comunicado publicado no mural!', 'success');
  }

  saveStateToStorage();
  closeModal('modal-aviso');
  renderCurrentView();
}

function deleteAviso(avisoId) {
  if (!confirm('Tem certeza de que deseja excluir este comunicado do mural?')) return;
  appState.avisos = (appState.avisos || []).filter(a => a.id !== avisoId);
  saveStateToStorage();
  renderCurrentView();
  showToast('Comunicado excluído.', 'info');
}

function updatePontoUrgentBanner() {
  const banner = document.getElementById('ponto-urgent-banner');
  if (!banner) return;

  const allAvisos = appState.avisos || [];
  // Procura aviso urgente ou fixado para esta filial ou geral
  const urgentAviso = allAvisos.find(a => 
    (a.categoria === 'urgente' || a.fixado) &&
    (!a.filialId || a.filialId === 'TODAS' || a.filialId === appState.activeBranchId)
  );

  if (urgentAviso) {
    banner.style.display = 'flex';
    banner.innerHTML = `
      <div class="ponto-urgent-banner-text">
        <span>📢</span>
        <div>
          <strong>${urgentAviso.categoria === 'urgente' ? 'ALERTA URGENTE:' : 'COMUNICADO FIXADO:'}</strong>
          ${escapeHtml(urgentAviso.titulo)}
        </div>
      </div>
      <button class="btn btn-cyan btn-sm" id="btn-banner-go-avisos" style="white-space:nowrap;">
        Ver no Mural ➔
      </button>
    `;
    document.getElementById('btn-banner-go-avisos')?.addEventListener('click', () => {
      appState.activeView = 'view-avisos';
      updateNavTabsActive('view-avisos');
      renderCurrentView();
    });
  } else {
    banner.style.display = 'none';
    banner.innerHTML = '';
  }
}

// ==========================================================================
// 9. GESTÃO DE COLABORADORES COM FILTROS AVANÇADOS
// ==========================================================================

let colabFiltersInitialized = false;
function setupColabFiltersDropdowns() {
  const deptSelect = document.getElementById('colab-filter-dept');
  const filialSelect = document.getElementById('colab-filter-filial');
  if (!deptSelect || !filialSelect) return;

  // Atualiza opções de filial sincronizando com a ativa
  const currentFilialVal = filialSelect.value || appState.activeBranchId;
  filialSelect.innerHTML = appState.filiais.map(f => 
    `<option value="${f.id}" ${f.id === appState.activeBranchId ? 'selected' : ''}>🏢 ${f.nome}</option>`
  ).join('') + '<option value="todas">🌐 Todas as Filiais</option>';

  if (filialSelect.value !== currentFilialVal && (currentFilialVal === 'todas' || appState.filiais.some(f => f.id === currentFilialVal))) {
    filialSelect.value = currentFilialVal;
  }

  // Departamentos
  const currentDeptVal = deptSelect.value || 'todos';
  deptSelect.innerHTML = '<option value="todos">Todos os Departamentos</option>' +
    appState.departamentos.map(d => `<option value="${d.id}">${d.nome}</option>`).join('');
  if (currentDeptVal) deptSelect.value = currentDeptVal;

  if (!colabFiltersInitialized) {
    colabFiltersInitialized = true;
    document.getElementById('colab-search-input')?.addEventListener('input', () => renderColaboradoresView());
    deptSelect.addEventListener('change', () => renderColaboradoresView());
    document.getElementById('colab-filter-status')?.addEventListener('change', () => renderColaboradoresView());
    document.getElementById('colab-filter-ponto')?.addEventListener('change', () => renderColaboradoresView());
    filialSelect.addEventListener('change', (e) => {
      if (e.target.value !== 'todas') {
        appState.activeBranchId = e.target.value;
        saveStateToStorage();
        renderBranchTabs();
      }
      renderColaboradoresView();
    });
    document.getElementById('btn-colab-reset-filters')?.addEventListener('click', () => {
      const searchIn = document.getElementById('colab-search-input');
      if (searchIn) searchIn.value = '';
      deptSelect.value = 'todos';
      const stEl = document.getElementById('colab-filter-status');
      if (stEl) stEl.value = 'ativo';
      const ptEl = document.getElementById('colab-filter-ponto');
      if (ptEl) ptEl.value = 'todos';
      filialSelect.value = appState.activeBranchId;
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

  // Subtítulo indicador da filial
  const subEl = document.getElementById('colab-branch-subtitle');
  if (subEl) {
    const curBranch = branchMap[appState.activeBranchId] || 'Todas as Filiais';
    subEl.textContent = '📍 Filial Ativa: ' + curBranch;
  }

  // Preenche filtros
  setupColabFiltersDropdowns();

  // Filtragem da lista
  let list = appState.colaboradores.slice();

  // 1. Filial (por padrão filtra pela filial ativa selecionada no topo)
  const filialSelect = document.getElementById('colab-filter-filial');
  const selectedFilial = filialSelect ? filialSelect.value : appState.activeBranchId;
  if (selectedFilial && selectedFilial !== 'todas') {
    list = list.filter(c => c.filialId === selectedFilial);
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
      list = list.filter(c => c.status !== 'demitido');
    } else if (statusSelect.value === 'demitido') {
      list = list.filter(c => c.status === 'demitido');
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

  // Ordenação por crachá
  list.sort((a, b) => Number(a.cracha) - Number(b.cracha));

  // Contador de resultados
  const countEl = document.getElementById('colab-stats-count');
  if (countEl) {
    const totalBranchColabs = appState.colaboradores.filter(c => c.filialId === appState.activeBranchId).length;
    countEl.innerHTML = `<span>Exibindo <strong>${list.length}</strong> de ${totalBranchColabs} colaborador(es) desta empresa (Total no sistema: ${appState.colaboradores.length})</span><span style="color:var(--color-text-muted);">* Alterne a filial acima na barra para ver outra empresa</span>`;
  }

  tbody.innerHTML = '';
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 24px; color: var(--color-text-sub);">Nenhum colaborador encontrado para os filtros selecionados nesta filial.</td></tr>';
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

    const tr = document.createElement('tr');
    tr.innerHTML = '<td style="font-family: var(--font-mono); font-weight:700;">' + colab.cracha + '</td><td><strong>' + escapeHtml(colab.nome) + '</strong></td><td>' + (branchMap[colab.filialId] || 'Não informada') + '</td><td>' + (deptMap[colab.deptId] || 'Geral') + '</td><td>' + formatDateBR(colab.admissao) + '</td><td class="text-center">' + pontoBadge + '</td><td class="text-center">' + statusBadge + '</td><td class="text-center"><button class="btn btn-secondary btn-sm btn-edit-colab" data-id="' + colab.id + '">✏️ Editar</button> <button class="btn btn-danger btn-sm btn-delete-colab" data-id="' + colab.id + '">🗑️ Excluir</button></td>';
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
  const registraSelect = document.getElementById('emp-registra-ponto');
  const statusSelect = document.getElementById('emp-status');
  const demissaoGroup = document.getElementById('group-emp-demissao');
  const demissaoInput = document.getElementById('emp-demissao');

  branchSelect.innerHTML = appState.filiais.map(f => '<option value="' + f.id + '">' + f.nome + '</option>').join('');
  deptSelect.innerHTML = appState.departamentos.map(d => '<option value="' + d.id + '">' + d.nome + '</option>').join('');

  if (empId) {
    const emp = appState.colaboradores.find(c => c.id === empId);
    if (!emp) return;
    document.getElementById('emp-edit-id').value = emp.id;
    document.getElementById('emp-name').value = emp.nome;
    document.getElementById('emp-badge').value = emp.cracha;
    document.getElementById('emp-admission').value = emp.admissao;
    document.getElementById('emp-branch').value = emp.filialId;
    document.getElementById('emp-dept').value = emp.deptId;
    if (registraSelect) registraSelect.value = emp.registraPonto !== false ? 'sim' : 'nao';
    if (statusSelect) {
      statusSelect.value = emp.status === 'demitido' ? 'demitido' : 'ativo';
      if (demissaoGroup) demissaoGroup.style.display = emp.status === 'demitido' ? 'block' : 'none';
    }
    if (demissaoInput) demissaoInput.value = emp.dataDemissao || '';
    document.getElementById('modal-employee-title').innerHTML = '<span>👤</span> Editar Funcionário';
  } else {
    document.getElementById('emp-edit-id').value = '';
    document.getElementById('emp-name').value = '';
    document.getElementById('emp-badge').value = Math.max(0, ...appState.colaboradores.map(c => Number(c.cracha) || 0)) + 1;
    document.getElementById('emp-admission').value = new Date().toISOString().split('T')[0];
    document.getElementById('emp-branch').value = appState.activeBranchId;
    if (registraSelect) registraSelect.value = 'sim';
    if (statusSelect) {
      statusSelect.value = 'ativo';
      if (demissaoGroup) demissaoGroup.style.display = 'none';
    }
    if (demissaoInput) demissaoInput.value = '';
    document.getElementById('modal-employee-title').innerHTML = '<span>👤</span> Cadastrar Funcionário';
  }

  openModal('modal-employee');
}

// Alterar visibilidade do campo de demissão no modal
document.getElementById('emp-status')?.addEventListener('change', (e) => {
  const group = document.getElementById('group-emp-demissao');
  if (group) group.style.display = e.target.value === 'demitido' ? 'block' : 'none';
});

document.getElementById('btn-save-employee')?.addEventListener('click', () => {
  const id = document.getElementById('emp-edit-id').value;
  const nome = document.getElementById('emp-name').value.trim();
  const cracha = parseInt(document.getElementById('emp-badge').value, 10);
  const admissao = document.getElementById('emp-admission').value;
  const filialId = document.getElementById('emp-branch').value;
  const deptId = document.getElementById('emp-dept').value;
  const registraPonto = document.getElementById('emp-registra-ponto')?.value === 'sim';
  const status = document.getElementById('emp-status')?.value || 'ativo';
  const dataDemissao = status === 'demitido' ? (document.getElementById('emp-demissao')?.value || '') : '';

  if (!nome || isNaN(cracha) || !admissao) {
    showToast('Preencha os campos obrigatórios corretamente.', 'warning');
    return;
  }

  if (status === 'demitido' && !dataDemissao) {
    showToast('Informe a data de demissão para colaboradores desligados.', 'warning');
    return;
  }

  if (id) {
    const idx = appState.colaboradores.findIndex(c => c.id === id);
    if (idx !== -1) {
      appState.colaboradores[idx] = { 
        ...appState.colaboradores[idx], 
        nome, 
        cracha, 
        admissao, 
        filialId, 
        deptId,
        registraPonto,
        status,
        dataDemissao
      };
    }
  } else {
    const newId = 'colab-' + cracha;
    appState.colaboradores.push({ 
      id: newId, 
      nome, 
      cracha, 
      admissao, 
      filialId, 
      deptId,
      registraPonto,
      status,
      dataDemissao
    });
  }

  saveStateToStorage();
  closeModal('modal-employee');
  renderCurrentView();
  showToast('Colaborador salvo com sucesso!', 'success');
});

function deleteEmployee(empId) {
  const emp = appState.colaboradores.find(c => c.id === empId);
  if (!emp) return;
  if (!confirm('Confirma a exclusão do colaborador "' + emp.nome + '" (Crachá: ' + emp.cracha + ')?')) return;

  appState.colaboradores = appState.colaboradores.filter(c => c.id !== empId);
  saveStateToStorage();
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

  saveStateToStorage();
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
  saveStateToStorage();
  renderCurrentView();
}

document.getElementById('btn-save-dept')?.addEventListener('click', () => {
  const nome = document.getElementById('dept-name').value.trim();
  if (!nome) return;

  const newId = 'dept-' + Date.now();
  appState.departamentos.push({ id: newId, nome });
  document.getElementById('dept-name').value = '';

  saveStateToStorage();
  closeModal('modal-dept');
  renderCurrentView();
  showToast('Departamento "' + nome + '" criado!', 'success');
});

function deleteDept(deptId) {
  if (appState.departamentos.length <= 1) {
    showToast('Mantenha pelo menos um departamento.', 'warning');
    return;
  }
  appState.departamentos = appState.departamentos.filter(d => d.id !== deptId);
  saveStateToStorage();
  renderCurrentView();
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

  let csv = 'Crachá;Nome;Departamento;Registra_Ponto;Situacao;Data_Demissao;Dias_Uteis;Dias_OK;Meios_Dias;Faltas_Atestados;Valor_Liquido_RS;Valor_Descontado_RS\n';
  employees.forEach(colab => {
    const va = calculateVAForEmployee(colab.id, year, month, appState.activeBranchId);
    csv += colab.cracha + ';"' + colab.nome + '";"' + (deptMap[colab.deptId] || '') + '";"' + (colab.registraPonto ? 'SIM' : 'NAO') + '";"' + (colab.status || 'ativo') + '";"' + formatDateBR(colab.dataDemissao) + '";' + va.totalBusinessDays + ';' + va.fullDaysWorked + ';' + va.halfDaysWorked + ';' + va.absenceDays + ';' + va.valorLiquido.toFixed(2) + ';' + va.valorDescontado.toFixed(2) + '\n';
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

// Backup JSON
document.getElementById('btn-export-backup')?.addEventListener('click', () => {
  const dataStr = JSON.stringify(appState, null, 2);
  downloadFile('backup_ponto_va_' + new Date().toISOString().split('T')[0] + '.json', dataStr, 'application/json');
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
      const imported = JSON.parse(event.target.result);
      if (!imported.filiais || !imported.colaboradores) {
        showToast('Arquivo JSON inválido. Estrutura incorreta.', 'warning');
        return;
      }
      appState.filiais = imported.filiais || [];
      appState.departamentos = imported.departamentos || [];
      appState.colaboradores = (imported.colaboradores || []).map(c => ({
        ...c,
        registraPonto: c.registraPonto !== false,
        status: c.status || 'ativo',
        dataDemissao: c.dataDemissao || ''
      }));
      appState.feriados = imported.feriados || [];
      if (imported.avisos && Array.isArray(imported.avisos)) {
        appState.avisos = imported.avisos;
      }
      appState.registrosPonto = imported.registrosPonto || {};
      appState.carryOverDsr = imported.carryOverDsr || {};

      saveStateToStorage();
      renderCurrentView();
      showToast('Backup restaurado com sucesso!', 'success');
    } catch (err) {
      showToast('Erro ao importar arquivo JSON: formato inválido.', 'warning');
    }
  };
  reader.readAsText(file);
});

// ==========================================================================
// 10. MODAL CONTROLS & UTILS
// ==========================================================================
function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add('active');
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.remove('active');
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
  // Eventos do Mural de Avisos
  document.getElementById('btn-novo-aviso')?.addEventListener('click', () => openAvisoModal());
  document.getElementById('btn-empty-novo-aviso')?.addEventListener('click', () => openAvisoModal());
  document.getElementById('btn-salvar-aviso')?.addEventListener('click', saveAvisoFromModal);

  document.getElementById('avisos-search-input')?.addEventListener('input', () => renderAvisosView());
  document.getElementById('avisos-filter-categoria')?.addEventListener('change', () => renderAvisosView());
  document.getElementById('avisos-filter-escopo')?.addEventListener('change', () => renderAvisosView());

  // Navegação de Mês
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
}

// Inicialização Geral ao Carregar a Página
document.addEventListener('DOMContentLoaded', () => {
  loadStateFromStorage();
  setupNavigation();
  initEvents();

  // Restaurar estado visual inicial
  if (appState.focusMode) {
    document.getElementById('focus-toggle-btn')?.classList.add('active');
  }
  if (document.getElementById('sort-select')) {
    document.getElementById('sort-select').value = appState.sortBy;
  }
  if (document.getElementById('filter-status-select')) {
    document.getElementById('filter-status-select').value = appState.statusFilter || 'ativos';
  }

  updateNavTabsActive(appState.activeView || 'view-avisos');
  renderCurrentView();

  // Sincronização automática em segundo plano com a nuvem Supabase
  syncFromCloudOnStart();
});

