/**
 * Catálogo fixo de navios fictícios pra alimentar o botão "Adicionar navio" do admin
 * (`admin/navios`) — pedido explícito do usuário como uma seção TOTALMENTE mockada, sem endpoint
 * de backend por trás. Isso é deliberado, não um atalho: `POST /ships` já existe, mas exige
 * `ORGANIZER_ADMIN` e cria o navio pro PRÓPRIO organizador do token (`requireOrganizerId`) — o
 * admin da plataforma não tem (e não deveria ter) como criar um navio em nome de um organizador
 * qualquer sem um fluxo de autorização por trás que este pedido não pediu. Mesmo espírito de
 * "mockado com rigor" do resto do projeto (reembolso/webhook/parcelamento): os dados aqui são
 * realistas, não placeholder, só não persistem no banco — ficam salvos em `localStorage`
 * (por navegador) via a própria página, pra sobreviver a um reload sem precisar de servidor.
 */
export interface MockShipOption {
  id: string;
  name: string;
  shipClass: 'Expedição' | 'Luxo' | 'Família' | 'Temático' | 'Boutique';
  passengerCapacity: number;
  yearBuilt: number;
  description: string;
}

export const MOCK_SHIP_CATALOG: MockShipOption[] = [
  { id: 'mock-ship-01', name: 'MS Aurora Boreal', shipClass: 'Luxo', passengerCapacity: 1800, yearBuilt: 2019, description: 'Rotas nórdicas com deck de observação panorâmica e spa com vista para o mar.' },
  { id: 'mock-ship-02', name: 'RMS Ventos do Atlântico', shipClass: 'Família', passengerCapacity: 3200, yearBuilt: 2015, description: 'Navio de grande porte, foco em travessias transatlânticas com programação para todas as idades.' },
  { id: 'mock-ship-03', name: 'MS Serenidade Azul', shipClass: 'Boutique', passengerCapacity: 650, yearBuilt: 2022, description: 'Navio pequeno e intimista, poucas suítes, atendimento quase 1 a 1.' },
  { id: 'mock-ship-04', name: 'SS Constelação do Sul', shipClass: 'Temático', passengerCapacity: 2100, yearBuilt: 2011, description: 'Teatro principal com capacidade para grandes shows ao vivo, decorado com tema astronômico.' },
  { id: 'mock-ship-05', name: 'MS Ecos do Pacífico', shipClass: 'Expedição', passengerCapacity: 900, yearBuilt: 2020, description: 'Casco reforçado pra rotas mais remotas, com equipe de naturalistas a bordo.' },
  { id: 'mock-ship-06', name: 'MS Sinfonia das Marés', shipClass: 'Temático', passengerCapacity: 2600, yearBuilt: 2017, description: 'Três palcos simultâneos e um teatro afundado no convés principal.' },
  { id: 'mock-ship-07', name: 'RMS Horizonte Infinito', shipClass: 'Luxo', passengerCapacity: 1400, yearBuilt: 2023, description: 'Todas as cabines com varanda privativa, restaurante assinado por chef convidado.' },
  { id: 'mock-ship-08', name: 'MS Pérola do Caribe', shipClass: 'Família', passengerCapacity: 4200, yearBuilt: 2013, description: 'Parque aquático no convés superior e clube infantil em três faixas etárias.' },
  { id: 'mock-ship-09', name: 'MS Rota das Estrelas', shipClass: 'Temático', passengerCapacity: 1950, yearBuilt: 2016, description: 'Observatório no convés mais alto, ideal pra cruzeiros noturnos temáticos.' },
  { id: 'mock-ship-10', name: 'SS Vagalume do Mar', shipClass: 'Boutique', passengerCapacity: 480, yearBuilt: 2021, description: 'Iluminação de casco personalizada, virou ponto turístico em portos pequenos.' },
  { id: 'mock-ship-11', name: 'MS Brisa Encantada', shipClass: 'Família', passengerCapacity: 3600, yearBuilt: 2014, description: 'Piscina de ondas artificiais e teleférico interno entre os decks de lazer.' },
  { id: 'mock-ship-12', name: 'MS Rainha do Atlântico', shipClass: 'Luxo', passengerCapacity: 1100, yearBuilt: 2018, description: 'Réplica do estilo clássico dos transatlânticos dos anos 30, com toque contemporâneo.' },
  { id: 'mock-ship-13', name: 'RMS Nômade dos Sete Mares', shipClass: 'Expedição', passengerCapacity: 750, yearBuilt: 2024, description: 'Rotas alternadas a cada temporada, nunca repete o mesmo itinerário duas vezes seguidas.' },
  { id: 'mock-ship-14', name: 'MS Coral Vivo', shipClass: 'Temático', passengerCapacity: 2300, yearBuilt: 2012, description: 'Aquário público integrado ao lobby principal, com curadoria de recifes de coral.' },
  { id: 'mock-ship-15', name: 'MS Farol de Prata', shipClass: 'Boutique', passengerCapacity: 520, yearBuilt: 2020, description: 'Navio menor com biblioteca marítima e sala de leitura com vista 270°.' },
  { id: 'mock-ship-16', name: 'SS Ondas Douradas', shipClass: 'Luxo', passengerCapacity: 1650, yearBuilt: 2019, description: 'Cassino premiado e três restaurantes de assinatura, um por continente.' },
  { id: 'mock-ship-17', name: 'MS Eco Tropical', shipClass: 'Expedição', passengerCapacity: 820, yearBuilt: 2022, description: 'Propulsão híbrida, pensado pra rotas de baixo impacto em áreas de preservação.' },
  { id: 'mock-ship-18', name: 'MS Bússola de Outono', shipClass: 'Família', passengerCapacity: 2950, yearBuilt: 2010, description: 'Um dos primeiros da frota, reformado em 2021 com decks totalmente renovados.' },
  { id: 'mock-ship-19', name: 'RMS Sereia Nortista', shipClass: 'Temático', passengerCapacity: 2450, yearBuilt: 2017, description: 'Casco pintado com mural marinho, virou assinatura visual da linha temática.' },
  { id: 'mock-ship-20', name: 'MS Aurora do Equador', shipClass: 'Luxo', passengerCapacity: 1300, yearBuilt: 2021, description: 'Rotas equatoriais com deck solar e piscina de borda infinita na popa.' },
  { id: 'mock-ship-21', name: 'MS Ventania Real', shipClass: 'Família', passengerCapacity: 3800, yearBuilt: 2015, description: 'Simulador de surf a bordo e arena esportiva multiuso no convés 12.' },
  { id: 'mock-ship-22', name: 'SS Maré Cheia', shipClass: 'Temático', passengerCapacity: 2000, yearBuilt: 2013, description: 'Palco anfiteatro voltado pro mar, usado pra shows ao pôr do sol.' },
  { id: 'mock-ship-23', name: 'MS Estrela Guia', shipClass: 'Boutique', passengerCapacity: 590, yearBuilt: 2023, description: 'Navio-conceito com apenas suítes, sem cabines internas em todo o casco.' },
  { id: 'mock-ship-24', name: 'MS Refúgio Flutuante', shipClass: 'Expedição', passengerCapacity: 680, yearBuilt: 2019, description: 'Equipado pra rotas polares, com trajes de expedição disponíveis a bordo.' },
  { id: 'mock-ship-25', name: 'RMS Timoneiro Eterno', shipClass: 'Luxo', passengerCapacity: 1500, yearBuilt: 2016, description: 'Ponte de comando visitável, tradição de mais de uma década na frota.' },
  { id: 'mock-ship-26', name: 'MS Cristal do Sul', shipClass: 'Família', passengerCapacity: 3300, yearBuilt: 2014, description: 'Teto de vidro retrátil no salão principal, aberto em noites de céu limpo.' },
  { id: 'mock-ship-27', name: 'MS Sonho Náutico', shipClass: 'Temático', passengerCapacity: 2150, yearBuilt: 2018, description: 'Camarotes com tema de constelações, cada deck nomeado por uma fase da lua.' },
  { id: 'mock-ship-28', name: 'SS Baía Encantada', shipClass: 'Boutique', passengerCapacity: 460, yearBuilt: 2022, description: 'Ancora em baías pouco convencionais, com tênders próprios pra desembarque.' },
  { id: 'mock-ship-29', name: 'MS Horizonte Violeta', shipClass: 'Luxo', passengerCapacity: 1250, yearBuilt: 2020, description: 'Decoração autoral, muda de tema a cada dois anos — atual: "crepúsculo perpétuo".' },
  { id: 'mock-ship-30', name: 'MS Alma do Mar', shipClass: 'Expedição', passengerCapacity: 710, yearBuilt: 2021, description: 'Parceria com institutos de pesquisa marinha, laboratório aberto a visitação.' },
  { id: 'mock-ship-31', name: 'RMS Zênite Marinho', shipClass: 'Família', passengerCapacity: 4000, yearBuilt: 2012, description: 'Maior navio já adicionado à frota fictícia, com anfiteatro pra 1200 pessoas.' },
  { id: 'mock-ship-32', name: 'MS Deriva Poética', shipClass: 'Boutique', passengerCapacity: 410, yearBuilt: 2024, description: 'O mais novo da linha — sarau literário toda noite no salão de popa.' },
];
