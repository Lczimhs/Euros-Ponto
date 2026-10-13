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
      colabId: "colab-1034",
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
      colabId: "colab-1020",
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
      departmentFilter: appState.departmentFilter || 'todos',
      calFilterDept: appState.calFilterDept || 'todos',
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

function normalizeAviso(a) {
  return {
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
        // Se avisos da nuvem forem do formato antigo sem data, usa o seed legal enriquecido
        const hasDates = cloud.avisos.some(a => !!a.data);
        appState.avisos = hasDates ? cloud.avisos.map(normalizeAviso) : getDefaultSeedData().avisos;
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
          aprendiz: !!(c.aprendiz || c.isAprendiz),
          registraPonto: c.registraPonto !== false,
          status: c.status || 'ativo',
          dataDemissao: c.dataDemissao || ''
        }));
        appState.feriados = parsed.feriados || [];

        // Se avisos existentes no storage forem do modelo antigo sem "data", carrega os novos seed
        const rawAvisos = (parsed.avisos && Array.isArray(parsed.avisos) && parsed.avisos.length > 0)
          ? parsed.avisos
          : getDefaultSeedData().avisos;
        const hasCalendarDates = rawAvisos.some(a => !!a.data);
        appState.avisos = hasCalendarDates ? rawAvisos.map(normalizeAviso) : getDefaultSeedData().avisos;

        appState.registrosPonto = parsed.registrosPonto || {};
        appState.carryOverDsr = parsed.carryOverDsr || {};

        if (parsed.activeBranchId && appState.filiais.some(f => f.id === parsed.activeBranchId)) {
          appState.activeBranchId = parsed.activeBranchId;
        } else {
          appState.activeBranchId = appState.filiais[0].id;
        }

        // Correção cadastral para o colaborador Wesley Patrick (crachá 1034 - admitido 09/10/2026)
        const wesley = appState.colaboradores.find(c => Number(c.cracha) === 1034 || c.id === 'colab-1034');
        if (wesley) {
          wesley.status = 'ativo';
          wesley.admissao = '2026-10-09';
          wesley.dataDemissao = '';
        }
        // Remove qualquer aviso residual que marcava Wesley como demitido
        if (appState.avisos && Array.isArray(appState.avisos)) {
          appState.avisos = appState.avisos.filter(a => {
            const isWesley = a.colabId === 'colab-1034' || (a.titulo && a.titulo.toLowerCase().includes('wesley'));
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
          // Garante fechamento de ponto no último dia útil do mês (Sábado 31/10/2026)
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
        saveStateToStorage();
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
  const isAprendiz = !!(colab && (colab.aprendiz === true || colab.isAprendiz === true));
  const baseRate = isAprendiz ? 4.00 : 8.00;
  const halfRate = isAprendiz ? 2.00 : 4.00;

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
        } else if (resolved.type === 'FM' || resolved.type === 'FT' || resolved.type === '1/2 ATESTADO') {
          creditado = halfRate;
          descontado = halfRate;
          halfDaysWorked++;
          note = 'Meio período (' + resolved.type + ') - Desconto R$ ' + halfRate.toFixed(2).replace('.', ',');
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
        } else if (resolved.type === 'FALTA' || resolved.type === 'ATESTADO') {
          creditado = 0.00;
          descontado = baseRate;
          absenceDays++;
          note = resolved.type + ' - Desconto integral de R$ ' + baseRate.toFixed(2).replace('.', ',');
        } else if (resolved.type === 'FÉRIAS' || resolved.type === 'AFASTADO') {
          creditado = 0.00;
          descontado = baseRate;
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
  renderBranchTabs();
  updateMonthDisplay();
  updateMainToolbarDepartmentOptions();

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
    if (colab.aprendiz || colab.isAprendiz) {
      extraBadge += '<span class="badge-aprendiz" style="font-size:10px; margin-left:6px; background:rgba(245, 158, 11, 0.2); color:#FDE047; border:1px solid rgba(245, 158, 11, 0.5); padding:1px 5px; border-radius:3px;" title="Jovem Aprendiz: Meio período (R$ 4,00/dia útil)">Aprendiz (R$ 4/dia)</span>';
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

  const summary = document.getElementById('va-audit-summary');
  summary.innerHTML = '<div><strong style="color:var(--color-cyan); font-size:14px;">' + colab.nome + '</strong> (Crachá: ' + colab.cracha + ')<div style="font-size:11px; color:var(--color-text-sub);">Setor: ' + (deptMap[colab.deptId] || '') + aprendizLabel + ' • Mês: ' + MESES_PT[appState.currentMonth] + '/' + appState.currentYear + (colab.status === 'demitido' ? ' • Desligado em: ' + formatDateBR(colab.dataDemissao) : '') + '</div></div><div style="text-align:right;"><span style="font-size:11px; color:var(--color-text-muted);">Líquido a Pagar:</span><div style="color:var(--color-cyan); font-family:var(--font-mono); font-size:16px; font-weight:700;">R$ ' + va.valorLiquido.toFixed(2).replace('.', ',') + '</div><div style="font-size:10px; color:#B4A6CF;">Descontos: R$ ' + va.valorDescontado.toFixed(2).replace('.', ',') + '</div></div>';

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
  const topDiv = document.createElement('div');
  topDiv.className = 'cal-day-top';
  topDiv.innerHTML = `
    <span class="cal-day-number">${dayNum}</span>
    <button class="cal-day-add-btn" title="Adicionar novo prazo neste dia">+</button>
  `;
  cell.appendChild(topDiv);

  // Lista de badges de aviso
  const noticesContainer = document.createElement('div');
  noticesContainer.className = 'cal-cell-notices';

  const MAX_PILLS = 3;
  const visiblePills = dayNotices.slice(0, MAX_PILLS);
  const remainingCount = dayNotices.length - MAX_PILLS;

  visiblePills.forEach(aviso => {
    const pill = document.createElement('div');
    pill.className = `cal-notice-pill notice-pill-${aviso.tipo || 'outros'} ${aviso.concluido ? 'is-done' : ''}`;

    let icon = '📌';
    if (aviso.tipo === 'rescisao') icon = '🔴';
    else if (aviso.tipo === 'salario') icon = '🟡';
    else if (aviso.tipo === 'ferias') icon = '🟣';
    else if (aviso.tipo === 'ponto') icon = '🔵';
    else if (aviso.tipo === 'fgts') icon = '🟢';

    const checkIcon = aviso.concluido ? '✅ ' : `${icon} `;
    pill.innerHTML = `<span>${checkIcon}</span><span style="overflow:hidden; text-overflow:ellipsis;">${escapeHtml(aviso.titulo)}</span>`;
    pill.title = `${aviso.titulo} (${aviso.concluido ? 'Concluído/Feito' : 'Pendente'})`;
    noticesContainer.appendChild(pill);
  });

  if (remainingCount > 0) {
    const moreBadge = document.createElement('div');
    moreBadge.className = 'cal-notice-more-badge';
    moreBadge.textContent = `+${remainingCount} mais...`;
    noticesContainer.appendChild(moreBadge);
  }

  cell.appendChild(noticesContainer);

  // Handler do botão "+"
  topDiv.querySelector('.cal-day-add-btn').addEventListener('click', (e) => {
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

    let tipoBadge = '⚪ Outros';
    if (aviso.tipo === 'rescisao') tipoBadge = '🔴 Rescisão CLT';
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
          <div style="display:flex; gap:6px; margin-bottom:4px; align-items:center;">
            <span class="badge-aviso-cat badge-cat-informativo" style="font-size:10px; padding:2px 6px;">${tipoBadge}</span>
            <span class="badge-aviso-scope" style="font-size:10px; padding:2px 6px;">${escapeHtml(filialNome)}</span>
            ${aviso.concluido ? '<span class="status-badge-done">✅ Feito</span>' : '<span class="status-badge-pending">🔴 Pendente</span>'}
          </div>
          <div style="font-size:14px; font-weight:700; color:var(--color-text-main); margin-bottom:2px;">
            ${escapeHtml(aviso.titulo)}
          </div>
          ${colabNome ? `<div style="font-size:12px; color:var(--color-cyan);">👤 ${escapeHtml(colabNome)}</div>` : ''}
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

      let tipoLabel = '⚪ Outros';
      if (aviso.tipo === 'rescisao') tipoLabel = '🔴 Rescisão Contratual (10 dias)';
      else if (aviso.tipo === 'salario') tipoLabel = '🟡 Pagamento Salarial / Vale';
      else if (aviso.tipo === 'ferias') tipoLabel = '🟣 Férias CLT';
      else if (aviso.tipo === 'ponto') tipoLabel = '🔵 Ponto Eletrônico & VA';
      else if (aviso.tipo === 'fgts') tipoLabel = '🟢 FGTS Digital / eSocial';

      const statusBadge = aviso.concluido
        ? '<span class="status-badge-done">✅ Feito (Concluído)</span>'
        : '<span class="status-badge-pending">🔴 Pendente</span>';

      const colabName = aviso.colabId ? (colabMap[aviso.colabId] || 'Colaborador vinculado') : null;

      card.innerHTML = `
        <div class="day-notice-header">
          <div class="day-notice-badges">
            <span class="badge-aviso-cat badge-cat-informativo" style="font-size:10px; padding:2px 6px;">${tipoLabel}</span>
            <span class="badge-aviso-scope" style="font-size:10px; padding:2px 6px;">${scopeName}</span>
            ${statusBadge}
          </div>
          <div style="font-size:11px; color:var(--color-text-muted);">
            ${aviso.concluidoEm ? 'Feito em: ' + formatDateTimeBR(aviso.concluidoEm) : 'Criado em: ' + formatDateTimeBR(aviso.createdAt)}
          </div>
        </div>

        <h4 class="day-notice-title">${escapeHtml(aviso.titulo)}</h4>

        ${colabName ? `<div style="font-size:12px; color:var(--color-cyan); font-weight:600;">👤 Colaborador: ${escapeHtml(colabName)}</div>` : ''}

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
    boxRescisao.style.display = (preset === 'rescisao') ? 'block' : 'none';
  }

  const calYear = appState.calendarYear || 2026;
  const calMonth = (typeof appState.calendarMonth === 'number') ? appState.calendarMonth : 9;

  if (preset === 'rescisao') {
    if (tipoInput) tipoInput.value = 'rescisao';
    const inputDemissao = document.getElementById('input-calc-demissao-data');
    const demissaoVal = inputDemissao?.value || new Date().toISOString().split('T')[0];
    const prazoFatal = addCalendarDays(demissaoVal, 10);
    if (dataInput) dataInput.value = prazoFatal;
    if (tituloInput) tituloInput.value = `🔴 Pagamento Rescisão Contratual - ${colabNome} (10 dias CLT Art. 477)`;
    if (descInput) descInput.value = `Prazo improrrogável de 10 dias corridos para pagamento integral das verbas rescisórias e entrega das guias (TRCT/FGTS) conforme Art. 477, § 6º da CLT. Demissão em: ${formatDateBR(demissaoVal)}.`;
  } else if (preset === 'salario_5') {
    if (tipoInput) tipoInput.value = 'salario';
    const quintoDia = get5thBusinessDay(calYear, calMonth);
    if (dataInput) dataInput.value = quintoDia;
    if (tituloInput) tituloInput.value = `🟡 Pagamento Salarial Mensal (5º Dia Útil - CLT Art. 459)`;
    if (descInput) descInput.value = `Até o 5º dia útil do mês subsequente ao trabalhado conforme Art. 459, § 1º da CLT.`;
  } else if (preset === 'adiantamento') {
    if (tipoInput) tipoInput.value = 'salario';
    if (dataInput) dataInput.value = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-20`;
    if (tituloInput) tituloInput.value = `🟡 Adiantamento Salarial Quinzenal (Vale 40%)`;
    if (descInput) descInput.value = `Pagamento do vale salarial quinzenal aos colaboradores com opção cadastrada.`;
  } else if (preset === 'ferias_aviso') {
    if (tipoInput) tipoInput.value = 'ferias';
    if (tituloInput) tituloInput.value = `🟣 Aviso Prévio de Férias - ${colabNome} (30 dias antecedência CLT)`;
    if (descInput) descInput.value = `Comunicação formal por escrito com antecedência mínima de 30 dias (Art. 135 da CLT).`;
  } else if (preset === 'ferias_pagto') {
    if (tipoInput) tipoInput.value = 'ferias';
    if (tituloInput) tituloInput.value = `🟣 Pagamento de Férias + 1/3 - ${colabNome} (Até 2 dias antes - CLT Art. 145)`;
    if (descInput) descInput.value = `O pagamento da remuneração das férias e do terço constitucional deve ser efetuado até 2 dias antes do início do respectivo período (Art. 145 da CLT).`;
  } else if (preset === 'ponto_fechamento') {
    if (tipoInput) tipoInput.value = 'ponto';
    const lastBusinessDay = getLastBusinessDay(calYear, calMonth);
    if (dataInput) dataInput.value = lastBusinessDay;
    if (tituloInput) tituloInput.value = `🔵 Fechamento de Ponto & VA (Último dia útil do mês)`;
    if (descInput) descInput.value = `Data de corte no último dia útil do mês (${formatDateBR(lastBusinessDay)}) para conferência de batidas manuais, faltas e atestados para apuração definitiva do crédito de Vale Alimentação.`;
  } else if (preset === 'fgts_digital') {
    if (tipoInput) tipoInput.value = 'fgts';
    if (dataInput) dataInput.value = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-20`;
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
        updatedAt: new Date().toISOString()
      };
      showToast('Prazo atualizado com sucesso!', 'success');
    }
  } else {
    const isDone = concluidoCheck.checked;
    const newAviso = {
      id: 'aviso-' + Date.now(),
      data: dataVal,
      tipo: tipoInput.value,
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

function updatePontoUrgentBanner() {
  const banner = document.getElementById('ponto-urgent-banner');
  if (!banner) return;

  const allAvisos = appState.avisos || [];
  // Procura rescisão ou aviso urgente pendente para esta filial ou geral
  const urgentAviso = allAvisos.find(a =>
    !a.concluido && (a.tipo === 'rescisao' || a.tipo === 'ponto') &&
    (!a.filialId || a.filialId === 'TODAS' || a.filialId === appState.activeBranchId)
  );

  if (urgentAviso) {
    banner.style.display = 'flex';
    banner.innerHTML = `
      <div class="ponto-urgent-banner-text">
        <span>⚠️</span>
        <div>
          <strong>PRAZO LEGAL PENDENTE:</strong>
          ${escapeHtml(urgentAviso.titulo)} (Data: ${formatDateBR(urgentAviso.data)})
        </div>
      </div>
      <button class="btn btn-cyan btn-sm" id="btn-banner-go-avisos" style="white-space:nowrap;">
        Ver no Calendário ➔
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

  if (!colabFiltersInitialized) {
    colabFiltersInitialized = true;
    document.getElementById('colab-search-input')?.addEventListener('input', () => renderColaboradoresView());
    deptSelect.addEventListener('change', () => renderColaboradoresView());
    document.getElementById('colab-filter-status')?.addEventListener('change', () => renderColaboradoresView());
    document.getElementById('colab-filter-ponto')?.addEventListener('change', () => renderColaboradoresView());
    document.getElementById('btn-colab-reset-filters')?.addEventListener('click', () => {
      const searchIn = document.getElementById('colab-search-input');
      if (searchIn) searchIn.value = '';
      deptSelect.value = 'todos';
      const stEl = document.getElementById('colab-filter-status');
      if (stEl) stEl.value = 'ativo';
      const ptEl = document.getElementById('colab-filter-ponto');
      if (ptEl) ptEl.value = 'todos';
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

  // Subtítulo indicador da filial ativa selecionada no topo
  const subEl = document.getElementById('colab-branch-subtitle');
  if (subEl) {
    const curBranch = branchMap[appState.activeBranchId] || 'Filial Selecionada';
    subEl.textContent = '📍 Filial Ativa: ' + curBranch;
  }

  // Preenche filtros
  setupColabFiltersDropdowns();

  // 1. FILTRAGEM ESTRITA PELA FILIAL ATIVA SELECIONADA NO TOPO (IGUAL AO DASHBOARD DE PONTO)
  let list = appState.colaboradores.filter(c => c.filialId === appState.activeBranchId);

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

  // Ordenação: se houver busca, nomes que iniciam com o texto digitado ficam no topo!
  if (q) {
    list.sort((a, b) => {
      const aStarts = a.nome.toLowerCase().startsWith(q);
      const bStarts = b.nome.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.nome.localeCompare(b.nome);
    });
  } else {
    list.sort((a, b) => Number(a.cracha) - Number(b.cracha));
  }

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
    const isAprendiz = colab.aprendiz || colab.isAprendiz;
    const aprendizBadge = isAprendiz
      ? ' <span class="badge-aprendiz" style="font-size:10px; background:rgba(245, 158, 11, 0.2); color:#FDE047; border:1px solid rgba(245, 158, 11, 0.5); padding:1px 5px; border-radius:3px;">Aprendiz</span>'
      : '';

    const tr = document.createElement('tr');
    tr.innerHTML = '<td style="font-family: var(--font-mono); font-weight:700;">' + colab.cracha + '</td><td><strong>' + escapeHtml(colab.nome) + '</strong>' + aprendizBadge + '</td><td>' + (branchMap[colab.filialId] || 'Não informada') + '</td><td>' + (deptMap[colab.deptId] || 'Geral') + '</td><td>' + formatDateBR(colab.admissao) + '</td><td class="text-center">' + pontoBadge + '</td><td class="text-center">' + statusBadge + '</td><td class="text-center"><button class="btn btn-secondary btn-sm btn-edit-colab" data-id="' + colab.id + '">✏️ Editar</button> <button class="btn btn-danger btn-sm btn-delete-colab" data-id="' + colab.id + '">🗑️ Excluir</button></td>';
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
  const checkAprendiz = document.getElementById('emp-check-aprendiz');
  const checkDemitido = document.getElementById('emp-check-demitido');
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

    if (checkRegistra) checkRegistra.checked = emp.registraPonto !== false;
    if (checkAprendiz) checkAprendiz.checked = !!(emp.aprendiz || emp.isAprendiz);

    const isDemitido = emp.status === 'demitido';
    if (checkDemitido) checkDemitido.checked = isDemitido;
    if (demissaoGroup) demissaoGroup.style.display = isDemitido ? 'block' : 'none';
    if (demissaoInput) demissaoInput.value = emp.dataDemissao || '';

    document.getElementById('modal-employee-title').innerHTML = '<span>👤</span> Editar Funcionário';
  } else {
    document.getElementById('emp-edit-id').value = '';
    document.getElementById('emp-name').value = '';
    document.getElementById('emp-badge').value = Math.max(0, ...appState.colaboradores.map(c => Number(c.cracha) || 0)) + 1;
    document.getElementById('emp-admission').value = new Date().toISOString().split('T')[0];
    document.getElementById('emp-branch').value = appState.activeBranchId;

    if (checkRegistra) checkRegistra.checked = true;
    if (checkAprendiz) checkAprendiz.checked = false;
    if (checkDemitido) checkDemitido.checked = false;
    if (demissaoGroup) demissaoGroup.style.display = 'none';
    if (demissaoInput) demissaoInput.value = '';

    document.getElementById('modal-employee-title').innerHTML = '<span>👤</span> Cadastrar Funcionário';
  }

  openModal('modal-employee');
}

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

  const registraPonto = document.getElementById('emp-check-registra-ponto')
    ? document.getElementById('emp-check-registra-ponto').checked
    : (document.getElementById('emp-registra-ponto')?.value !== 'nao');

  const aprendiz = document.getElementById('emp-check-aprendiz')
    ? document.getElementById('emp-check-aprendiz').checked
    : false;

  const isDemitido = document.getElementById('emp-check-demitido')
    ? document.getElementById('emp-check-demitido').checked
    : (document.getElementById('emp-status')?.value === 'demitido');

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
        aprendiz,
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
      aprendiz,
      registraPonto,
      status,
      dataDemissao
    });
  }

  const colabKeyId = id || ('colab-' + cracha);

  // GERAÇÃO AUTOMÁTICA DE AVISO NO MURAL DE PRAZOS (CLT Art. 477 - 10 dias corridos)
  if (status === 'demitido' && dataDemissao) {
    const prazoFatal = addCalendarDays(dataDemissao, 10);
    const avisoId = 'aviso-rescisao-' + colabKeyId;

    if (!appState.avisos) appState.avisos = [];
    const existingIdx = appState.avisos.findIndex(a => a.id === avisoId || (a.colabId === colabKeyId && a.tipo === 'rescisao'));

    const avisoObj = {
      id: avisoId,
      data: prazoFatal,
      tipo: 'rescisao',
      titulo: `🔴 Prazo Limite Rescisão - ${nome} (10 dias CLT Art. 477)`,
      descricao: `Prazo legal fatal de 10 dias corridos para homologação e pagamento de verbas rescisórias (Art. 477, § 6º da CLT). Data da demissão: ${formatDateBR(dataDemissao)}. Prazo fatal: ${formatDateBR(prazoFatal)}.`,
      filialId: filialId,
      colabId: colabKeyId,
      concluido: false,
      concluidoEm: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (existingIdx !== -1) {
      appState.avisos[existingIdx] = { ...appState.avisos[existingIdx], ...avisoObj };
    } else {
      appState.avisos.unshift(avisoObj);
    }
  } else if (status === 'ativo') {
    // Se colaborador for reativado como 'ativo', remove aviso de rescisão pendente
    if (appState.avisos && Array.isArray(appState.avisos)) {
      appState.avisos = appState.avisos.filter(a => {
        const isThisColab = a.colabId === colabKeyId || a.id === ('aviso-rescisao-' + colabKeyId);
        return !(isThisColab && a.tipo === 'rescisao' && !a.concluido);
      });
    }
  }

  saveStateToStorage();
  closeModal('modal-employee');
  renderCurrentView();

  if (status === 'demitido') {
    showToast(`Colaborador salvo e aviso de rescisão (10 dias CLT Art. 477) publicado no mural até ${formatDateBR(addCalendarDays(dataDemissao, 10))}!`, 'purple');
  } else {
    showToast('Colaborador salvo com sucesso!', 'success');
  }
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

  let csv = 'Crachá;Nome;Departamento;Aprendiz;Taxa_Dia_RS;Registra_Ponto;Situacao;Data_Demissao;Dias_Uteis;Dias_OK;Meios_Dias;Faltas_Atestados;Valor_Liquido_RS;Valor_Descontado_RS\n';
  employees.forEach(colab => {
    const va = calculateVAForEmployee(colab.id, year, month, appState.activeBranchId);
    const isAprendiz = !!(colab.aprendiz || colab.isAprendiz);
    const taxaDia = isAprendiz ? '4.00' : '8.00';
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

  // Cálculo Automático de 10 Dias Corridos para Rescisão (CLT Art. 477)
  document.getElementById('btn-calc-prazo-rescisao')?.addEventListener('click', () => {
    const demissaoVal = document.getElementById('input-calc-demissao-data')?.value;
    if (!demissaoVal) {
      showToast('Por favor, informe a data da demissão.', 'warning');
      return;
    }
    const prazoFatal = addCalendarDays(demissaoVal, 10);
    const avisoData = document.getElementById('aviso-data');
    if (avisoData) avisoData.value = prazoFatal;

    const colabSelect = document.getElementById('aviso-colab');
    const colabNome = (colabSelect && colabSelect.selectedIndex > 0)
      ? colabSelect.options[colabSelect.selectedIndex].text
      : 'Colaborador';

    const tituloInput = document.getElementById('aviso-titulo');
    if (tituloInput) {
      tituloInput.value = `🔴 Prazo Limite Rescisão - ${colabNome} (10 dias CLT Art. 477)`;
    }

    const descInput = document.getElementById('aviso-descricao');
    if (descInput) {
      descInput.value = `Prazo legal fatal de 10 dias corridos para pagamento integral das verbas rescisórias e entrega de guias (Art. 477, § 6º da CLT). Data da demissão: ${formatDateBR(demissaoVal)}. Prazo máximo: ${formatDateBR(prazoFatal)}.`;
    }

    showToast(`Prazo de 10 dias aplicado! Data fatal: ${formatDateBR(prazoFatal)}`, 'success');
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

    saveStateToStorage();
    renderCurrentView();
    showToast('Filtros redefinidos: exibindo todos em ordem alfabética.', 'info');
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
  if (document.getElementById('filter-dept-select')) {
    document.getElementById('filter-dept-select').value = appState.departmentFilter || 'todos';
  }
  if (document.getElementById('search-filter-input')) {
    document.getElementById('search-filter-input').value = appState.searchFilter || '';
  }

  updateNavTabsActive(appState.activeView || 'view-avisos');
  renderCurrentView();

  // Sincronização automática em segundo plano com a nuvem Supabase
  syncFromCloudOnStart();
});

