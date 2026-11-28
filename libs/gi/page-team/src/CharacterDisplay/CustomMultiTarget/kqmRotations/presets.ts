import type { CharacterKey } from '@genshin-optimizer/gi/consts'
import type { KqmRotationPreset } from './types'
import { step } from './types'

export const KQM_ROTATIONS: Record<CharacterKey, KqmRotationPreset> = {
  Aino: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/aino-quickguide/',
    steps: [
      step(1, ['skill', 'dmg1'], 'E — Habilidade (dmg1)'),
      step(1, ['skill', 'dmg2'], 'E — Habilidade (dmg2)'),
      step(6, ['burst', 'ballDmg'], 'Q — Supremo (ballDmg)'),
    ],
  },
  Albedo: {
    comboNotation: 'E Q C',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (E Q C).',
    sourceUrl: 'https://keqingmains.com/q/albedo-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(6, ['skill', 'blossom'], 'E — Habilidade (blossom)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(1, ['burst', 'blossom'], 'Q — Supremo (blossom)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg1'], 'Combo — Ataque Carregado (dmg1)'),
    ],
  },
  Alhaitham: {
    comboNotation: 'Q 2[N3D] E 2[N3D] C 2[N3D]',
    description:
      'Combo padrão KQM de 3 Espelhos: Supremo + ataques normais com projeções de 3 Espelhos.',
    sourceUrl: 'https://keqingmains.com/q/alhaitham-quickguide/',
    steps: [
      step(10, ['burst', 'instanceDmg'], 'Q — 10 instâncias (3 Espelhos)'),
      step(1, ['skill', 'rushDmg'], 'E — Dano de Investida'),
      step(6, ['skill', 'mirrorDmg1'], 'Projeções de Espelho (6 procs)'),
      step(6, ['normal', '0'], '6[N3D] — 1º Golpe'),
      step(6, ['normal', '1'], '6[N3D] — 2º Golpe'),
      step(6, ['normal', '2'], '6[N3D] — 3º Golpe'),
      step(1, ['charged', 'dmg'], 'C — Ataque Carregado'),
    ],
  },
  Aloy: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/aloy-quickguide/',
    steps: [
      step(1, ['skill', 'freezeBombDmg'], 'E — Habilidade (freezeBombDmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
    ],
  },
  Alyosha: {
    comboNotation: 'Q E',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (Q E).',
    sourceUrl: 'https://keqingmains.com/q/alyosha-quickguide/',
    steps: [
      step(1, ['skill', 'pressDmg'], 'E — Habilidade (pressDmg)'),
      step(1, ['skill', 'holdDmg'], 'E — Habilidade (holdDmg)'),
      step(6, ['burst', 'fieldDmg'], 'Q — Supremo (fieldDmg)'),
      step(1, ['burst', 'tugarinDmg'], 'Q — Supremo (tugarinDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Amber: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/amber-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(6, ['burst', 'rainDmg'], 'Q — Supremo (rainDmg)'),
      step(
        3,
        ['charged', 'aimedCharged'],
        'Combo — Ataque Carregado (aimedCharged)'
      ),
    ],
  },
  AratakiItto: {
    comboNotation: 'Q E N2 5[C] F N4 5[C] F',
    description:
      'Combo beginner-friendly KQM: Supremo + Ushi + ataques carregados Kesagiri + golpe final.',
    sourceUrl: 'https://keqingmains.com/q/itto-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Ushi'),
      step(8, ['charged', 'akSlash'], 'Ataques Carregados Kesagiri (8 cortes)'),
      step(2, ['charged', 'akFinal'], 'Golpe Final Kesagiri (2x)'),
      step(2, ['normal', '0'], 'N1 (2x)'),
      step(2, ['normal', '1'], 'N2 (2x)'),
    ],
  },
  Arlecchino: {
    comboNotation: 'E > C 3[N5D]',
    description:
      'Combo beginner-friendly KQM: E para aplicar Diretiva, Carregado para absorver Contrato de Vida e 3 sequências de N5D.',
    sourceUrl: 'https://keqingmains.com/q/arlecchino-quickguide/',
    steps: [
      step(1, ['skill', 'spikeDmg'], 'E — Dano de Espinho'),
      step(1, ['skill', 'finalDmg'], 'E — Dano de Corte Final'),
      step(1, ['charged', 'dmg'], 'C — Ataque Carregado (absorve marca)'),
      step(3, ['normal', '0'], '3[N5D] — 1º Golpe'),
      step(3, ['normal', '1'], '3[N5D] — 2º Golpe'),
      step(3, ['normal', '2'], '3[N5D] — 3º Golpe'),
      step(6, ['normal', '3'], '3[N5D] — 4º Golpe (2 acertos)'),
      step(3, ['normal', '4'], '3[N5D] — 5º Golpe'),
    ],
  },
  Baizhu: {
    comboNotation: 'E Q',
    description:
      'Foco suporte KQM: Cura da Habilidade + Escudo e cura do Supremo.',
    sourceUrl: 'https://keqingmains.com/q/baizhu-quickguide/',
    steps: [
      step(1, ['skill', 'heal'], 'E — Cura da Habilidade'),
      step(6, ['burst', 'heal'], 'Q — Cura do Supremo (6 ticks)'),
      step(6, ['burst', 'shield'], 'Q — Escudo do Supremo (6x)'),
    ],
  },
  Barbara: {
    comboNotation: 'E Q',
    description:
      'Foco suporte cura KQM: Cura contínua da Habilidade + Cura instantânea do Supremo.',
    sourceUrl: 'https://keqingmains.com/q/barbara-quickguide/',
    steps: [
      step(4, ['skill', 'cregen'], 'E — Cura Contínua (4 ticks)'),
      step(1, ['burst', 'regen'], 'Q — Cura do Supremo'),
    ],
  },
  Beidou: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/beidou-quickguide/',
    steps: [
      step(1, ['skill', 'baseDmg'], 'E — Habilidade (baseDmg)'),
      step(1, ['skill', 'dmgOneHit'], 'E — Habilidade (dmgOneHit)'),
      step(1, ['burst', 'burstDmg'], 'Q — Supremo (burstDmg)'),
      step(1, ['burst', 'lightningDmg'], 'Q — Supremo (lightningDmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
      step(
        3,
        ['charged', 'spinningDmg'],
        'Combo — Ataque Carregado (spinningDmg)'
      ),
    ],
  },
  Bennett: {
    comboNotation: 'tE Q',
    description:
      'Combo padrão suporte KQM: Habilidade (toque) + Supremo (cura e buff de ATQ).',
    sourceUrl: 'https://keqingmains.com/q/bennett-quickguide/',
    steps: [
      step(1, ['burst', 'regen'], 'Q — Cura por tick do Supremo'),
      step(1, ['burst', 'dmg'], 'Q — Dano do Supremo'),
      step(1, ['skill', 'press'], 'tE — Habilidade Elemental'),
    ],
  },
  Candace: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/candace-quickguide/',
    steps: [
      step(1, ['skill', 'chargedDmg'], 'E — Habilidade (chargedDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(6, ['burst', 'waveDmg'], 'Q — Supremo (waveDmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Charlotte: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/charlotte-quickguide/',
    steps: [
      step(1, ['burst', 'castHeal'], 'Q — Cura'),
      step(1, ['burst', 'kameraHeal'], 'Q — Cura'),
      step(1, ['skill', 'photoPressDmg'], 'E — Habilidade (photoPressDmg)'),
      step(1, ['skill', 'photoHoldDmg'], 'E — Habilidade (photoHoldDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
    ],
  },
  Chasca: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/chasca-quickguide/',
    steps: [
      step(1, ['skill', 'activationDmg'], 'E — Habilidade (activationDmg)'),
      step(1, ['skill', 'pressDmg'], 'E — Habilidade (pressDmg)'),
      step(1, ['burst', 'galeSplittingDmg'], 'Q — Supremo (galeSplittingDmg)'),
      step(1, ['burst', 'shellDmg'], 'Q — Supremo (shellDmg)'),
      step(
        3,
        ['charged', 'fullyAimed'],
        'Combo — Ataque Carregado (fullyAimed)'
      ),
    ],
  },
  Chevreuse: {
    comboNotation: '3[hE]',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (3[hE]).',
    sourceUrl: 'https://keqingmains.com/q/chevreuse-quickguide/',
    steps: [
      step(1, ['skill', 'heal'], 'E — Cura'),
      step(1, ['skill', 'pressDmg'], 'E — Habilidade (pressDmg)'),
      step(1, ['skill', 'holdDmg'], 'E — Habilidade (holdDmg)'),
      step(1, ['burst', 'grenadeDmg'], 'Q — Supremo (grenadeDmg)'),
      step(1, ['burst', 'shellDmg'], 'Q — Supremo (shellDmg)'),
    ],
  },
  Chiori: {
    comboNotation: '2[E] (Q)',
    description:
      'Combo padrão off-field KQM: 2x E (troca automática) + Tamoto off-field.',
    sourceUrl: 'https://keqingmains.com/q/chiori-quickguide/',
    steps: [
      step(1, ['skill', 'sweepDmg'], 'E — Corte Inicial'),
      step(8, ['skill', 'turretDmg'], 'E — Ataques da Tamoto (8x)'),
      step(1, ['burst', 'bloomDmg'], 'Q — Supremo'),
    ],
  },
  Chongyun: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/chongyun-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
    ],
  },
  Citlali: {
    comboNotation: 'E Q',
    description:
      'Combo padrão KQM: Habilidade (Escudo + Tempestade) + Supremo.',
    sourceUrl: 'https://keqingmains.com/q/citlali-quickguide/',
    steps: [
      step(1, ['skill', 'shield'], 'E — Absorção do Escudo'),
      step(1, ['skill', 'obsidianDmg'], 'E — Dano Inicial'),
      step(8, ['skill', 'frostfallStormDmg'], 'E — Tempestade (8 ticks)'),
      step(1, ['burst', 'iceStormDmg'], 'Q — Dano do Supremo'),
    ],
  },
  Clorinde: {
    comboNotation: 'Q E 6[N3E]',
    description:
      'Combo beginner-friendly do Quick Guide KQM: Supremo + Habilidade e 6 ciclos de 3 disparos Perfura-Noite + Estocada Caçada Selvagem.',
    sourceUrl: 'https://keqingmains.com/q/clorinde-quickguide/',
    steps: [
      step(6, ['skill', 'normalDmg'], '6[N3E] — Disparo Perfura-Noite (N1)'),
      step(6, ['skill', 'normalDmg'], '6[N3E] — Disparo Perfura-Noite (N2)'),
      step(6, ['skill', 'piercingDmg'], '6[N3E] — Disparo Perfurante (N3)'),
      step(
        6,
        ['skill', 'thrust3Dmg'],
        '6[N3E] — Estocada Caçada Selvagem Nv.3 (E)'
      ),
      step(5, ['burst', 'skillDmg'], 'Supremo — 5 golpes'),
    ],
  },
  Collei: {
    comboNotation: 'Q E',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (Q E).',
    sourceUrl: 'https://keqingmains.com/q/collei-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'explosionDmg'], 'Q — Supremo (explosionDmg)'),
      step(1, ['burst', 'leapDmg'], 'Q — Supremo (leapDmg)'),
    ],
  },
  Columbina: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/columbina-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(6, ['skill', 'continuousDmg'], 'E — Habilidade (continuousDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Cyno: {
    comboNotation: '6[N4E]',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (6[N4E]).',
    sourceUrl: 'https://keqingmains.com/q/cyno-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['skill', 'riteDmg'], 'E — Habilidade (riteDmg)'),
      step(1, ['burst', 'normal_0'], 'Q — Supremo (normal_0)'),
      step(1, ['burst', 'normal_1'], 'Q — Supremo (normal_1)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Dahlia: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/dahlia-quickguide/',
    steps: [
      step(1, ['burst', 'shield'], 'Q — Escudo'),
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
    ],
  },
  Dehya: {
    comboNotation: 'Q N10',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (Q N10).',
    sourceUrl: 'https://keqingmains.com/q/dehya-quickguide/',
    steps: [
      step(1, ['skill', 'indomitableDmg'], 'E — Habilidade (indomitableDmg)'),
      step(1, ['skill', 'rangingDmg'], 'E — Habilidade (rangingDmg)'),
      step(1, ['burst', 'fistDmg'], 'Q — Supremo (fistDmg)'),
      step(1, ['burst', 'driveDmg'], 'Q — Supremo (driveDmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
      step(3, ['charged', 'spin'], 'Combo — Ataque Carregado (spin)'),
    ],
  },
  Diluc: {
    comboNotation: 'Q N2E N2E N2E N2',
    description: 'Combo beginner-friendly KQM: Supremo + 3x N2E + N2.',
    sourceUrl: 'https://keqingmains.com/q/diluc-quickguide/',
    steps: [
      step(1, ['burst', 'slashDmg'], 'Q — Corte Inicial'),
      step(1, ['skill', 'firstHit'], 'E — 1º Golpe'),
      step(1, ['skill', 'secondHit'], 'E — 2º Golpe'),
      step(1, ['skill', 'thirdHit'], 'E — 3º Golpe'),
      step(4, ['normal', '0'], '4x N1'),
      step(4, ['normal', '1'], '4x N2'),
    ],
  },
  Diona: {
    comboNotation: 'hE Q',
    description: 'Foco suporte KQM: Escudo Segurar (hE) + Cura do Supremo.',
    sourceUrl: 'https://keqingmains.com/q/diona-quickguide/',
    steps: [
      step(1, ['skill', 'holdShield'], 'hE — Escudo Segurar'),
      step(6, ['burst', 'healDot'], 'Q — Cura do Supremo (6 ticks)'),
    ],
  },
  Dori: {
    comboNotation: 'E N2 D N2 C6',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (E N2 D N2 C6).',
    sourceUrl: 'https://keqingmains.com/q/dori-quickguide/',
    steps: [
      step(1, ['burst', 'heal'], 'Q — Cura'),
      step(1, ['skill', 'shotDmg'], 'E — Habilidade (shotDmg)'),
      step(1, ['skill', 'roundDmg'], 'E — Habilidade (roundDmg)'),
      step(1, ['burst', 'connectorDmg'], 'Q — Supremo (connectorDmg)'),
    ],
  },
  Durin: {
    comboNotation: '2[E]Q',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (2[E]Q).',
    sourceUrl: 'https://keqingmains.com/q/durin-quickguide/',
    steps: [
      step(1, ['skill', 'purityDmg'], 'E — Habilidade (purityDmg)'),
      step(1, ['skill', 'darkDmg1'], 'E — Habilidade (darkDmg1)'),
      step(1, ['burst', 'purityDmg1'], 'Q — Supremo (purityDmg1)'),
      step(1, ['burst', 'purityDmg2'], 'Q — Supremo (purityDmg2)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Emilie: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/emilie-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['skill', 'level1Dmg'], 'E — Habilidade (level1Dmg)'),
      step(1, ['burst', 'level3Dmg'], 'Q — Supremo (level3Dmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Escoffier: {
    comboNotation: 'Q E E',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (Q E E).',
    sourceUrl: 'https://keqingmains.com/q/escoffier-quickguide/',
    steps: [
      step(1, ['burst', 'heal'], 'Q — Cura'),
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['skill', 'parfaitDmg'], 'E — Habilidade (parfaitDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
    ],
  },
  Eula: {
    comboNotation: 'tE Q N4 hE N4',
    description:
      'Combo padrão KQM: tE + Supremo + N4 + hE + N4 + Espada Luminosa.',
    sourceUrl: 'https://keqingmains.com/q/eula-quickguide/',
    steps: [
      step(1, ['skill', 'press'], 'tE — Habilidade Toque'),
      step(1, ['skill', 'hold'], 'hE — Habilidade Segurar'),
      step(1, ['burst', 'dmg'], 'Q — Dano Inicial do Supremo'),
      step(
        1,
        ['burst', 'lightFallSwordNew'],
        'Q — Explosão da Espada Luminosa'
      ),
      step(2, ['normal', '0'], '2x N1'),
      step(2, ['normal', '1'], '2x N2'),
      step(4, ['normal', '2'], '2x N3 (2 golpes)'),
      step(2, ['normal', '3'], '2x N4'),
    ],
  },
  Faruzan: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/faruzan-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['skill', 'vortexDmg'], 'E — Habilidade (vortexDmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(
        3,
        ['charged', 'aimedCharged'],
        'Combo — Ataque Carregado (aimedCharged)'
      ),
    ],
  },
  Fischl: {
    comboNotation: 'E (ou Q)',
    description:
      'Rotação off-field KQM: Invocar Oz para ataques contínuos + passiva A4.',
    sourceUrl: 'https://keqingmains.com/q/fischl-quickguide/',
    steps: [
      step(1, ['skill', 'summonDmg'], 'E — Dano de Invocação do Oz'),
      step(10, ['skill', 'ozDmg'], 'E — Ataques do Oz (10 acertos)'),
      step(4, ['passive2', 'dmg'], 'Passiva A4 — Trovão Punitivo (4 procs)'),
    ],
  },
  Flins: {
    comboNotation: '2[N4D] N2 E',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (2[N4D] N2 E).',
    sourceUrl: 'https://keqingmains.com/q/flins-quickguide/',
    steps: [
      step(1, ['skill', 'na1'], 'E — Habilidade (na1)'),
      step(1, ['skill', 'na2'], 'E — Habilidade (na2)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(1, ['burst', 'middleLunarDmg'], 'Q — Supremo (middleLunarDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Freminet: {
    comboNotation: '4[2E N11] 2E 1C',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (4[2E N11] 2E 1C).',
    sourceUrl: 'https://keqingmains.com/q/freminet-quickguide/',
    steps: [
      step(1, ['skill', 'thrustDmg'], 'E — Habilidade (thrustDmg)'),
      step(1, ['skill', 'frostDmg'], 'E — Habilidade (frostDmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(
        3,
        ['charged', 'spinningDmg'],
        'Combo — Ataque Carregado (spinningDmg)'
      ),
    ],
  },
  Furina: {
    comboNotation: 'E Q',
    description:
      'Rotação padrão off-field KQM: Habilidade (Membros do Salão em campo) + Supremo.',
    sourceUrl: 'https://keqingmains.com/q/furina-quickguide/',
    steps: [
      step(1, ['skill', 'bubbleDmg'], 'E — Dano Inicial de Bolha'),
      step(
        10,
        ['skill', 'chevalDmg'],
        'E — Surintendante Chevalmarin (10 acertos)'
      ),
      step(6, ['skill', 'usherDmg'], 'E — Gentilhomme Usher (6 acertos)'),
      step(4, ['skill', 'crabDmg'], 'E — Mademoiselle Crabaletta (4 acertos)'),
      step(1, ['burst', 'skillDmg'], 'Q — Dano do Supremo'),
    ],
  },
  Gaming: {
    comboNotation: '7[EP]',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (7[EP]).',
    sourceUrl: 'https://keqingmains.com/q/gaming-quickguide/',
    steps: [
      step(1, ['burst', 'smashDmg'], 'Q — Supremo (smashDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'cyclicDmg'], 'Combo — Ataque Carregado (cyclicDmg)'),
    ],
  },
  Ganyu: {
    comboNotation: 'E Q 4[C]',
    description:
      'Combo padrão KQM: Habilidade + Supremo + 4 Disparos Carregados Nv.2.',
    sourceUrl: 'https://keqingmains.com/q/ganyu-quickguide/',
    steps: [
      step(4, ['charged', 'frostflake'], '4[C] — Flecha Geada'),
      step(4, ['charged', 'frostflakeBloom'], '4[C] — Explosão Florescer'),
      step(1, ['skill', 'dmg'], 'E — Lótus de Gelo'),
      step(10, ['burst', 'dmg'], 'Q — Estilhaços de Gelo (10 acertos)'),
    ],
  },
  Gorou: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/gorou-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(1, ['burst', 'crystalCollapse'], 'Q — Supremo (crystalCollapse)'),
      step(3, ['charged', 'fully'], 'Combo — Ataque Carregado (fully)'),
    ],
  },
  HuTao: {
    comboNotation: 'E 8[N1C] Q',
    description:
      'Combo beginner-friendly KQM: Habilidade + 8 ciclos de N1C + Supremo no fim.',
    sourceUrl: 'https://keqingmains.com/q/hu-tao-quickguide/',
    steps: [
      step(8, ['normal', '0'], '8[N1C] — 1º Golpe Normal'),
      step(8, ['charged', 'dmg'], '8[N1C] — Ataque Carregado'),
      step(2, ['skill', 'dmg'], 'Pétala Sangrenta (2 ticks)'),
      step(1, ['burst', 'lowHpDmg'], 'Q — Supremo (<50% HP)'),
    ],
  },
  Iansan: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/iansan-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Ifa: {
    comboNotation: 'Q E N13',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (Q E N13).',
    sourceUrl: 'https://keqingmains.com/q/ifa-quickguide/',
    steps: [
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(1, ['burst', 'hydro'], 'Q — Supremo (hydro)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Illuga: {
    comboNotation: 'Q E',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (Q E).',
    sourceUrl: 'https://keqingmains.com/q/illuga-quickguide/',
    steps: [
      step(1, ['skill', 'pressDmg'], 'E — Habilidade (pressDmg)'),
      step(1, ['skill', 'holdDmg'], 'E — Habilidade (holdDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Ineffa: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/ineffa-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['skill', 'birgittaDmg'], 'E — Habilidade (birgittaDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
    ],
  },
  Jahoda: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/jahoda-quickguide/',
    steps: [
      step(1, ['skill', 'bombDmg'], 'E — Habilidade (bombDmg)'),
      step(1, ['skill', 'unfilledDmg'], 'E — Habilidade (unfilledDmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(
        3,
        ['charged', 'fullyAimed'],
        'Combo — Ataque Carregado (fullyAimed)'
      ),
    ],
  },
  Jean: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/jean-quickguide/',
    steps: [
      step(4, ['burst', 'regen'], 'Q — Cura'),
      step(4, ['burst', 'contRegen'], 'Q — Cura'),
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
    ],
  },
  Kachina: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/kachina-quickguide/',
    steps: [
      step(1, ['skill', 'rideDmg'], 'E — Habilidade (rideDmg)'),
      step(1, ['skill', 'independentDmg'], 'E — Habilidade (independentDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
    ],
  },
  KaedeharaKazuha: {
    comboNotation: 'tE P Q',
    description: 'Combo padrão KQM: Habilidade toque + Imersivo + Supremo.',
    sourceUrl: 'https://keqingmains.com/q/kazuha-quickguide/',
    steps: [
      step(1, ['skill', 'press'], 'tE — Habilidade Elemental'),
      step(1, ['plunging', 'high'], 'P — Ataque Imersivo'),
      step(1, ['burst', 'dmg'], 'Q — Corte Inicial do Supremo'),
      step(5, ['burst', 'dot'], 'Q — Dano Contínuo (5 ticks)'),
    ],
  },
  Kaeya: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/kaeya-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
      step(3, ['charged', 'dmg1'], 'Combo — Ataque Carregado (dmg1)'),
    ],
  },
  KamisatoAyaka: {
    comboNotation: 'D N1 E Q 2[N2C]',
    description: 'Combo padrão KQM: Dash + N1 + E + Q (20 ticks) + 2[N2C].',
    sourceUrl: 'https://keqingmains.com/q/ayaka-quickguide/',
    steps: [
      step(1, ['skill', 'press'], 'E — Habilidade Elemental'),
      step(19, ['burst', 'cutting'], 'Q — 19 cortes do Supremo'),
      step(1, ['burst', 'bloom'], 'Q — Explosão final do Supremo'),
      step(3, ['normal', '0'], 'N1 + 2[N2C] — 1º Golpe'),
      step(2, ['normal', '1'], '2[N2C] — 2º Golpe'),
      step(6, ['charged', 'dmg1'], '2[N2C] — Ataque Carregado (3 hits x2)'),
    ],
  },
  KamisatoAyato: {
    comboNotation: 'Q E 15[N]',
    description:
      'Combo padrão KQM: Supremo + Habilidade (15 cortes Shunsuiken).',
    sourceUrl: 'https://keqingmains.com/q/ayato-quickguide/',
    steps: [
      step(5, ['skill', 'dmg0'], 'E — Shunsuiken 1º Golpe (5x)'),
      step(5, ['skill', 'dmg1'], 'E — Shunsuiken 2º Golpe (5x)'),
      step(5, ['skill', 'dmg2'], 'E — Shunsuiken 3º Golpe (5x)'),
      step(12, ['burst', 'dmg'], 'Q — Gotas de Flor (12 acertos)'),
    ],
  },
  Kaveh: {
    comboNotation: '2[N3D] N1 E 2[N3D] N2 E',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (2[N3D] N1 E 2[N3D] N2 E).',
    sourceUrl: 'https://keqingmains.com/q/kaveh-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
      step(3, ['charged', 'spin'], 'Combo — Ataque Carregado (spin)'),
    ],
  },
  Keqing: {
    comboNotation: 'E E Q N1C E 3[N1C]',
    description: 'Combo padrão KQM: Habilidade + Supremo + ciclos de N1C.',
    sourceUrl: 'https://keqingmains.com/q/keqing-quickguide/',
    steps: [
      step(1, ['skill', 'stiletto'], 'E — Estilete'),
      step(1, ['skill', 'slash'], 'E — Corte'),
      step(1, ['burst', 'initial'], 'Q — Dano Inicial'),
      step(8, ['burst', 'slash'], 'Q — 8 Cortes'),
      step(1, ['burst', 'final'], 'Q — Corte Final'),
      step(4, ['normal', '0'], '4[N1C] — 1º Golpe'),
      step(4, ['charged', 'dmg1'], '4[N1C] — Carregado (1)'),
      step(4, ['charged', 'dmg2'], '4[N1C] — Carregado (2)'),
    ],
  },
  Kinich: {
    comboNotation: '3[N2E]',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (3[N2E]).',
    sourceUrl: 'https://keqingmains.com/q/kinich-quickguide/',
    steps: [
      step(1, ['skill', 'shotDmg'], 'E — Habilidade (shotDmg)'),
      step(1, ['skill', 'cannonDmg'], 'E — Habilidade (cannonDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Kirara: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/kirara-quickguide/',
    steps: [
      step(1, ['skill', 'shield'], 'E — Escudo'),
      step(1, ['skill', 'maxShield'], 'E — Escudo'),
      step(1, ['skill', 'tailDmg'], 'E — Habilidade (tailDmg)'),
      step(1, ['skill', 'parcelDmg'], 'E — Habilidade (parcelDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(1, ['burst', 'explosionDmg'], 'Q — Supremo (explosionDmg)'),
    ],
  },
  Klee: {
    comboNotation: '5[N3]',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (5[N3]).',
    sourceUrl: 'https://keqingmains.com/q/klee-quickguide/',
    steps: [
      step(1, ['skill', 'jumptyDumptyDmg'], 'E — Habilidade (jumptyDumptyDmg)'),
      step(1, ['skill', 'mineDmg'], 'E — Habilidade (mineDmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  KujouSara: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/sara-quickguide/',
    steps: [step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)')],
  },
  KukiShinobu: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/shinobu-quickguide/',
    steps: [
      step(1, ['skill', 'pressDmg'], 'E — Habilidade (pressDmg)'),
      step(6, ['skill', 'ringDmg'], 'E — Habilidade (ringDmg)'),
      step(1, ['burst', 'singleDmg'], 'Q — Supremo (singleDmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
      step(3, ['charged', 'dmg1'], 'Combo — Ataque Carregado (dmg1)'),
    ],
  },
  LanYan: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/lan-yan-quickguide/',
    steps: [
      step(1, ['skill', 'shield'], 'E — Escudo'),
      step(6, ['skill', 'ringDmg'], 'E — Habilidade (ringDmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
    ],
  },
  Lauma: {
    comboNotation: 'hE Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (hE Q).',
    sourceUrl: 'https://keqingmains.com/q/lauma-quickguide/',
    steps: [
      step(1, ['skill', 'pressDmg'], 'E — Habilidade (pressDmg)'),
      step(1, ['skill', 'hold1Dmg'], 'E — Habilidade (hold1Dmg)'),
    ],
  },
  Layla: {
    comboNotation: 'E Q',
    description:
      'Foco suporte KQM: Escudo de Sono + Estrelas Cadentes e Supremo.',
    sourceUrl: 'https://keqingmains.com/q/layla-quickguide/',
    steps: [
      step(1, ['skill', 'skillShield'], 'E — Absorção do Escudo'),
      step(12, ['skill', 'starDmg'], 'E — Estrelas Cadentes (12x)'),
      step(8, ['burst', 'slugDmg'], 'Q — Projéteis do Supremo (8x)'),
    ],
  },
  Linnea: {
    comboNotation: '5[E]',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (5[E]).',
    sourceUrl: 'https://keqingmains.com/q/linnea-quickguide/',
    steps: [
      step(1, ['skill', 'crushDmg'], 'E — Habilidade (crushDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(
        3,
        ['charged', 'fullyAimed'],
        'Combo — Ataque Carregado (fullyAimed)'
      ),
    ],
  },
  Lisa: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/lisa-quickguide/',
    steps: [
      step(1, ['skill', 'stack0'], 'E — Habilidade (stack0)'),
      step(1, ['skill', 'stack1'], 'E — Habilidade (stack1)'),
      step(1, ['burst', 'summon'], 'Q — Supremo (summon)'),
      step(6, ['burst', 'tick'], 'Q — Supremo (tick)'),
    ],
  },
  Lohen: {
    comboNotation: '2[N1C] E',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (2[N1C] E).',
    sourceUrl: 'https://keqingmains.com/q/lohen-quickguide/',
    steps: [
      step(1, ['skill', '0'], 'E — Habilidade (0)'),
      step(1, ['skill', '1'], 'E — Habilidade (1)'),
      step(1, ['burst', 'burstDmg'], 'Q — Supremo (burstDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Lynette: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/lynette-quickguide/',
    steps: [
      step(1, ['skill', 'thrustDmg'], 'E — Habilidade (thrustDmg)'),
      step(1, ['skill', 'bladeDmg'], 'E — Habilidade (bladeDmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(1, ['burst', 'boxDmg'], 'Q — Supremo (boxDmg)'),
      step(3, ['charged', 'dmg1'], 'Combo — Ataque Carregado (dmg1)'),
    ],
  },
  Lyney: {
    comboNotation: '3[C] Q E',
    description:
      'Combo beginner-friendly KQM: 3 Disparos Carregados + Supremo + Habilidade.',
    sourceUrl: 'https://keqingmains.com/q/lyney-quickguide/',
    steps: [
      step(3, ['charged', 'prop'], '3[C] — Flecha Mágica'),
      step(3, ['charged', 'pyrotechnic'], '3[C] — Explosão Pirotécnica'),
      step(1, ['burst', 'dmg'], 'Q — Dano do Supremo'),
      step(1, ['burst', 'fireworkDmg'], 'Q — Explosão Final'),
      step(1, ['skill', 'dmg'], 'E — Habilidade Elemental'),
    ],
  },
  Mavuika: {
    comboNotation: 'Q 2[C4D]',
    description:
      'Combo beginner-friendly KQM: Supremo seguido de ataques carregados em círculo (Donut).',
    sourceUrl: 'https://keqingmains.com/q/mavuika-quickguide/',
    steps: [
      step(1, ['burst', 'skillDmg'], 'Q — Dano do Supremo'),
      step(
        8,
        ['skill', 'chargedCyclicDmg'],
        '2[C4D] — 8 giros de Ataque Carregado'
      ),
      step(2, ['skill', 'chargedFinalDmg'], '2[C4D] — 2 golpes finais'),
    ],
  },
  Mika: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/mika-quickguide/',
    steps: [
      step(1, ['burst', 'castHeal'], 'Q — Cura'),
      step(1, ['burst', 'plumeHeal'], 'Q — Cura'),
      step(1, ['skill', 'arrowDmg'], 'E — Habilidade (arrowDmg)'),
      step(1, ['skill', 'flareDmg'], 'E — Habilidade (flareDmg)'),
    ],
  },
  Mitya: {
    comboNotation: 'E Q',
    description: 'Rotação padrão baseada no kit do personagem (E Q).',
    sourceUrl: 'https://keqingmains.com/',
    steps: [
      step(1, ['skill', 'tapDmg'], 'E — Habilidade (tapDmg)'),
      step(1, ['skill', 'holdDmg'], 'E — Habilidade (holdDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
    ],
  },
  Mona: {
    comboNotation: 'Q N3 E N1',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (Q N3 E N1).',
    sourceUrl: 'https://keqingmains.com/q/mona-quickguide/',
    steps: [
      step(6, ['skill', 'dot'], 'E — Habilidade (dot)'),
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Mualani: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/mualani-quickguide/',
    steps: [
      step(1, ['skill', 'stack1Dmg'], 'E — Habilidade (stack1Dmg)'),
      step(1, ['skill', 'stack2Dmg'], 'E — Habilidade (stack2Dmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Nahida: {
    comboNotation: 'hE Q',
    description:
      'Rotação padrão KQM: Habilidade Segurar + Supremo + 6 procs de Purificação Tri-Karma.',
    sourceUrl: 'https://keqingmains.com/q/nahida-quickguide/',
    steps: [
      step(1, ['skill', 'holdDmg'], 'hE — Dano de Habilidade Segurar'),
      step(6, ['skill', 'karmaDmg'], 'E — Purificação Tri-Karma (6 procs)'),
    ],
  },
  Navia: {
    comboNotation: 'Q E N3D N2 E N3D N2',
    description:
      'Combo padrão KQM: Supremo + 2 disparos de Habilidade carregados + ataques normais Geo.',
    sourceUrl: 'https://keqingmains.com/q/navia-quickguide/',
    steps: [
      step(1, ['burst', 'skillDmg'], 'Q — Dano Inicial do Supremo'),
      step(10, ['burst', 'supportDmg'], 'Q — Bombardeio de Suporte (10 tiros)'),
      step(
        2,
        ['skill', 'totalShardDmg'],
        '2x E — Disparo de Cristal carregado'
      ),
      step(4, ['normal', '0'], 'N1 (4x)'),
      step(4, ['normal', '1'], 'N2 (4x)'),
      step(2, ['normal', '2'], 'N3 (2x)'),
    ],
  },
  Nefer: {
    comboNotation: '3[CD] E CD CQ CD',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (3[CD] E CD CQ CD).',
    sourceUrl: 'https://keqingmains.com/q/nefer-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['skill', 'shade1Dmg'], 'E — Habilidade (shade1Dmg)'),
      step(6, ['burst', 'hit1'], 'Q — Supremo (hit1)'),
      step(6, ['burst', 'hit2'], 'Q — Supremo (hit2)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Neuvillette: {
    comboNotation: 'E Q 3[C]',
    description:
      'Combo padrão KQM: Habilidade, Supremo e 3 Ataques Carregados Equitativos (8 ticks cada).',
    sourceUrl: 'https://keqingmains.com/q/neuvillette-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Dano de Habilidade'),
      step(1, ['burst', 'skillDmg'], 'Q — Dano Inicial do Supremo'),
      step(2, ['burst', 'waterfallDmg'], 'Q — 2 Cachoeiras'),
      step(
        24,
        ['charged', 'judgmentDmg'],
        '3[C] — 3 Ataques Carregados (24 ticks)'
      ),
    ],
  },
  Nicole: {
    comboNotation: 'Q E N',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (Q E N).',
    sourceUrl: 'https://keqingmains.com/q/nicole-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Nilou: {
    comboNotation: '4[E] N',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (4[E] N).',
    sourceUrl: 'https://keqingmains.com/q/nilou-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['skill', 'dance1Dmg'], 'E — Habilidade (dance1Dmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(1, ['burst', 'aeonDmg'], 'Q — Supremo (aeonDmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
    ],
  },
  Ningguang: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/ningguang-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['charged', 'baseDmg'], 'Combo — Ataque Carregado (baseDmg)'),
    ],
  },
  Noelle: {
    comboNotation: 'E Q 3[N3D]',
    description: 'Combo beginner-friendly KQM: Escudo + Supremo + 3x N3D.',
    sourceUrl: 'https://keqingmains.com/q/noelle-quickguide/',
    steps: [
      step(1, ['skill', 'shield'], 'E — Escudo'),
      step(1, ['burst', 'burstDmg'], 'Q — Dano Inicial'),
      step(3, ['normal', '0'], '3[N3D] — 1º Golpe'),
      step(3, ['normal', '1'], '3[N3D] — 2º Golpe'),
      step(3, ['normal', '2'], '3[N3D] — 3º Golpe'),
    ],
  },
  Odette: {
    comboNotation: 'E E',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E E).',
    sourceUrl: 'https://keqingmains.com/q/odette-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(6, ['skill', 'codaDotDmg'], 'E — Habilidade (codaDotDmg)'),
      step(6, ['burst', 'slashDmg'], 'Q — Supremo (slashDmg)'),
      step(1, ['burst', 'finalDmg'], 'Q — Supremo (finalDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Ororon: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/ororon-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'activationDmg'], 'Q — Supremo (activationDmg)'),
      step(6, ['burst', 'soundwaveDmg'], 'Q — Supremo (soundwaveDmg)'),
    ],
  },
  Prune: {
    comboNotation: '2[E]',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (2[E]).',
    sourceUrl: 'https://keqingmains.com/q/prune-quickguide/',
    steps: [
      step(6, ['skill', 'ringDmg'], 'E — Habilidade (ringDmg)'),
      step(1, ['skill', 'clanghydroDmg'], 'E — Habilidade (clanghydroDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(1, ['burst', 'bellDmg'], 'Q — Supremo (bellDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Qiqi: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/qiqi-quickguide/',
    steps: [
      step(4, ['skill', 'hitRegen'], 'E — Cura'),
      step(4, ['skill', 'contRegen'], 'E — Cura'),
      step(1, ['burst', 'heal'], 'Q — Cura'),
      step(1, ['skill', 'castDmg'], 'E — Habilidade (castDmg)'),
      step(6, ['skill', 'tickDmg'], 'E — Habilidade (tickDmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
    ],
  },
  RaidenShogun: {
    comboNotation: 'E Q 2[N4C] N2C',
    description:
      'Combo mais simples e beginner-friendly do Quick Guide KQM: Supremo inicial + 2[N4C] + N2C.',
    sourceUrl: 'https://keqingmains.com/q/raiden-quickguide/',
    steps: [
      step(1, ['burst', 'dmg'], 'Supremo — Dano do Musou no Hitotachi'),
      step(2, ['burst', 'hit1'], '2[N4C] — 1º Golpe (N1)'),
      step(2, ['burst', 'hit2'], '2[N4C] — 2º Golpe (N2)'),
      step(2, ['burst', 'hit3'], '2[N4C] — 3º Golpe (N3)'),
      step(2, ['burst', 'hit41'], '2[N4C] — 4º Golpe (1)'),
      step(2, ['burst', 'hit42'], '2[N4C] — 4º Golpe (2)'),
      step(2, ['burst', 'charged1'], '2[N4C] — Ataque Carregado (1)'),
      step(2, ['burst', 'charged2'], '2[N4C] — Ataque Carregado (2)'),
      step(1, ['burst', 'hit1'], 'N2C — 1º Golpe (N1)'),
      step(1, ['burst', 'hit2'], 'N2C — 2º Golpe (N2)'),
      step(1, ['burst', 'charged1'], 'N2C — Ataque Carregado (1)'),
      step(1, ['burst', 'charged2'], 'N2C — Ataque Carregado (2)'),
    ],
  },
  Razor: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/razor-quickguide/',
    steps: [
      step(1, ['skill', 'press'], 'E — Habilidade (press)'),
      step(1, ['skill', 'hold'], 'E — Habilidade (hold)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(1, ['burst', 'companionDmg1'], 'Q — Supremo (companionDmg1)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
    ],
  },
  Rosaria: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/rosaria-quickguide/',
    steps: [
      step(1, ['skill', 'hit1'], 'E — Habilidade (hit1)'),
      step(1, ['skill', 'hit2'], 'E — Habilidade (hit2)'),
      step(6, ['burst', 'hit1'], 'Q — Supremo (hit1)'),
      step(6, ['burst', 'hit2'], 'Q — Supremo (hit2)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Sandrone: {
    comboNotation: '3[C E]',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (3[C E]).',
    sourceUrl: 'https://keqingmains.com/q/sandrone-quickguide/',
    steps: [
      step(1, ['skill', 'prismDmg1'], 'E — Habilidade (prismDmg1)'),
      step(1, ['skill', 'prismDmg2'], 'E — Habilidade (prismDmg2)'),
      step(1, ['burst', 'bombardDmg'], 'Q — Supremo (bombardDmg)'),
      step(1, ['burst', 'rayDmg'], 'Q — Supremo (rayDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'sweepDmg'], 'Combo — Ataque Carregado (sweepDmg)'),
    ],
  },
  SangonomiyaKokomi: {
    comboNotation: 'E Q 3[N2W]',
    description: 'Rotação padrão KQM: Água-Viva (cura e dano) + Supremo.',
    sourceUrl: 'https://keqingmains.com/q/kokomi-quickguide/',
    steps: [
      step(6, ['skill', 'heal'], 'E — Cura da Água-Viva (6 ticks)'),
      step(6, ['skill', 'dmg'], 'E — Dano da Água-Viva (6 ticks)'),
      step(6, ['normal', '0'], 'Q — N1 sob Supremo (6x)'),
      step(6, ['normal', '1'], 'Q — N2 sob Supremo (6x)'),
    ],
  },
  Sayu: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/sayu-quickguide/',
    steps: [
      step(1, ['burst', 'pressHeal'], 'Q — Cura'),
      step(1, ['burst', 'darumaHeal'], 'Q — Cura'),
      step(1, ['skill', 'wheelDmg'], 'E — Habilidade (wheelDmg)'),
      step(1, ['skill', 'kickPressDmg'], 'E — Habilidade (kickPressDmg)'),
      step(1, ['burst', 'pressDmg'], 'Q — Supremo (pressDmg)'),
      step(1, ['burst', 'darumaDmg'], 'Q — Supremo (darumaDmg)'),
    ],
  },
  Sethos: {
    comboNotation: '5[N2W] N2 E',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (5[N2W] N2 E).',
    sourceUrl: 'https://keqingmains.com/q/sethos-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'dusk_0'], 'Q — Supremo (dusk_0)'),
      step(1, ['burst', 'dusk_1'], 'Q — Supremo (dusk_1)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(
        3,
        ['charged', 'fullyAimed'],
        'Combo — Ataque Carregado (fullyAimed)'
      ),
    ],
  },
  Shenhe: {
    comboNotation: 'Q tE',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (Q tE).',
    sourceUrl: 'https://keqingmains.com/q/shenhe-quickguide/',
    steps: [
      step(1, ['skill', 'press'], 'E — Habilidade (press)'),
      step(1, ['skill', 'hold'], 'E — Habilidade (hold)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(6, ['burst', 'dot'], 'Q — Supremo (dot)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  ShikanoinHeizou: {
    comboNotation: '2[N1C] E C0',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (2[N1C] E C0).',
    sourceUrl: 'https://keqingmains.com/q/heizou-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'hydro_iris_dmg'], 'Q — Supremo (hydro_iris_dmg)'),
      step(1, ['burst', 'pyro_iris_dmg'], 'Q — Supremo (pyro_iris_dmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Sigewinne: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/sigewinne-quickguide/',
    steps: [
      step(1, ['skill', 'teammateHeal'], 'E — Cura'),
      step(1, ['skill', 'selfHeal'], 'E — Cura'),
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['skill', 'bladeDmg'], 'E — Habilidade (bladeDmg)'),
      step(1, ['burst', 'spoutDmg'], 'Q — Supremo (spoutDmg)'),
    ],
  },
  Skirk: {
    comboNotation: '2[N2D]',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (2[N2D]).',
    sourceUrl: 'https://keqingmains.com/q/skirk-quickguide/',
    steps: [
      step(1, ['skill', '0'], 'E — Habilidade (0)'),
      step(1, ['skill', '1'], 'E — Habilidade (1)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(1, ['burst', 'finalDmg'], 'Q — Supremo (finalDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Somnia: {
    comboNotation: 'E Q',
    description: 'Rotação padrão baseada no kit do personagem (E Q).',
    sourceUrl: 'https://keqingmains.com/',
    steps: [
      step(1, ['skill', 'pressDmg'], 'E — Habilidade (pressDmg)'),
      step(1, ['burst', 'initialDmg'], 'Q — Supremo (initialDmg)'),
      step(6, ['burst', 'multDotDmg'], 'Q — Supremo (multDotDmg)'),
    ],
  },
  Sucrose: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/sucrose-quickguide/',
    steps: [
      step(1, ['skill', 'press'], 'E — Habilidade (press)'),
      step(6, ['burst', 'dot'], 'Q — Supremo (dot)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Tartaglia: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/tartaglia-quickguide/',
    steps: [
      step(1, ['skill', 'stanceDmg'], 'E — Habilidade (stanceDmg)'),
      step(1, ['skill', 'normal1'], 'E — Habilidade (normal1)'),
      step(1, ['burst', 'meleeDmg'], 'Q — Supremo (meleeDmg)'),
      step(1, ['burst', 'rangedDmg'], 'Q — Supremo (rangedDmg)'),
    ],
  },
  Thoma: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/thoma-quickguide/',
    steps: [
      step(1, ['skill', 'minShield'], 'E — Escudo'),
      step(1, ['skill', 'maxShield'], 'E — Escudo'),
      step(1, ['burst', 'shield'], 'Q — Escudo'),
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'pressDmg'], 'Q — Supremo (pressDmg)'),
      step(1, ['burst', 'collapseDmg'], 'Q — Supremo (collapseDmg)'),
    ],
  },
  Tighnari: {
    comboNotation: 'E C Q 2[C]',
    description:
      'Combo padrão KQM: Habilidade + 3 Disparos Carregados Nv.2 + Supremo.',
    sourceUrl: 'https://keqingmains.com/q/tighnari-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Dano de Habilidade'),
      step(3, ['charged', 'wreath'], '3[C] — Flecha Floral'),
      step(12, ['charged', 'cluster'], '3[C] — Flechas de Florescer (4x3)'),
      step(6, ['burst', 'primaryDmg'], 'Q — 6 Flechas Principais'),
      step(6, ['burst', 'secondaryDmg'], 'Q — 6 Flechas Secundárias'),
    ],
  },
  TravelerAnemo: {
    comboNotation: 'E Q',
    description: 'Rotação padrão baseada no kit do personagem (E Q).',
    sourceUrl: 'https://keqingmains.com/',
    steps: [
      step(1, ['skill', 'initial_dmg'], 'E — Habilidade (initial_dmg)'),
      step(1, ['skill', 'initial_max'], 'E — Habilidade (initial_max)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
    ],
  },
  TravelerCryo: {
    comboNotation: 'E Q',
    description: 'Rotação padrão baseada no kit do personagem (E Q).',
    sourceUrl: 'https://keqingmains.com/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['skill', 'crystalDmg'], 'E — Habilidade (crystalDmg)'),
    ],
  },
  TravelerDendro: {
    comboNotation: 'E N1 Q',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (E N1 Q).',
    sourceUrl: 'https://keqingmains.com/q/dendro-traveler-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'lampDmg'], 'Q — Supremo (lampDmg)'),
      step(1, ['burst', 'explosionDmg'], 'Q — Supremo (explosionDmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
    ],
  },
  TravelerElectro: {
    comboNotation: 'E Q',
    description: 'Rotação padrão baseada no kit do personagem (E Q).',
    sourceUrl: 'https://keqingmains.com/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'pressDmg'], 'Q — Supremo (pressDmg)'),
    ],
  },
  TravelerGeo: {
    comboNotation: 'E Q',
    description: 'Rotação padrão baseada no kit do personagem (E Q).',
    sourceUrl: 'https://keqingmains.com/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
    ],
  },
  TravelerHydro: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/hydro-traveler-quickguide/',
    steps: [
      step(1, ['skill', 'surgeDmg'], 'E — Habilidade (surgeDmg)'),
      step(1, ['skill', 'dewdropDmg'], 'E — Habilidade (dewdropDmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
    ],
  },
  TravelerPyro: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/pyro-traveler-quickguide/',
    steps: [
      step(1, ['skill', 'blazingDmg'], 'E — Habilidade (blazingDmg)'),
      step(
        1,
        ['skill', 'scorchingInstantDmg'],
        'E — Habilidade (scorchingInstantDmg)'
      ),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(3, ['charged', 'dmg1'], 'Combo — Ataque Carregado (dmg1)'),
    ],
  },
  Valeriy: {
    comboNotation: 'E Q',
    description: 'Rotação padrão baseada no kit do personagem (E Q).',
    sourceUrl: 'https://keqingmains.com/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(1, ['burst', 'shellDmg'], 'Q — Supremo (shellDmg)'),
    ],
  },
  Varesa: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/varesa-quickguide/',
    steps: [
      step(1, ['skill', 'rushDmg'], 'E — Habilidade (rushDmg)'),
      step(1, ['skill', 'fpRushDmg'], 'E — Habilidade (fpRushDmg)'),
      step(1, ['burst', 'kickDmg'], 'Q — Supremo (kickDmg)'),
      step(1, ['burst', 'fpKickDmg'], 'Q — Supremo (fpKickDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Varka: {
    comboNotation: '3[N1CW] N1',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (3[N1CW] N1).',
    sourceUrl: 'https://keqingmains.com/q/varka-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['skill', 'na1'], 'E — Habilidade (na1)'),
      step(1, ['burst', 'dmg1'], 'Q — Supremo (dmg1)'),
      step(1, ['burst', 'dmg2'], 'Q — Supremo (dmg2)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg1'], 'Combo — Ataque Carregado (dmg1)'),
    ],
  },
  Venti: {
    comboNotation: 'E N1',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E N1).',
    sourceUrl: 'https://keqingmains.com/q/venti-quickguide/',
    steps: [
      step(1, ['skill', 'press'], 'E — Habilidade (press)'),
      step(1, ['skill', 'hold'], 'E — Habilidade (hold)'),
      step(1, ['burst', 'base'], 'Q — Supremo (base)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'fully'], 'Combo — Ataque Carregado (fully)'),
    ],
  },
  Vesna: {
    comboNotation: 'E Q',
    description: 'Rotação padrão baseada no kit do personagem (E Q).',
    sourceUrl: 'https://keqingmains.com/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['skill', 'sword1Dmg'], 'E — Habilidade (sword1Dmg)'),
    ],
  },
  Vodyanitsa: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/vodyanitsa-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['skill', 'hornDmg'], 'E — Habilidade (hornDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  Wanderer: {
    comboNotation: 'E 6[N3] (Q)',
    description:
      'Combo beginner-friendly KQM: Habilidade + 6 sequências de N3 no ar + Supremo.',
    sourceUrl: 'https://keqingmains.com/q/wanderer-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Dano Inicial'),
      step(6, ['normal', '0'], '6[N3] — 1º Golpe'),
      step(6, ['normal', '1'], '6[N3] — 2º Golpe'),
      step(12, ['normal', '2'], '6[N3] — 3º Golpe (2 acertos)'),
      step(5, ['burst', 'dmg'], 'Q — Supremo (5 golpes)'),
    ],
  },
  Wriothesley: {
    comboNotation: 'E 3[N5C] (Q)',
    description:
      'Combo beginner-friendly KQM: Habilidade + 3 sequências de N5C + Supremo.',
    sourceUrl: 'https://keqingmains.com/q/wriothesley-quickguide/',
    steps: [
      step(3, ['normal', '0'], '3[N5C] — 1º Golpe'),
      step(3, ['normal', '1'], '3[N5C] — 2º Golpe'),
      step(3, ['normal', '2'], '3[N5C] — 3º Golpe'),
      step(6, ['normal', '3'], '3[N5C] — 4º Golpe (2 acertos)'),
      step(3, ['normal', '4'], '3[N5C] — 5º Golpe'),
      step(3, ['charged', 'rebukeDmg'], '3[N5C] — Ataque Carregado Aprimorado'),
    ],
  },
  Xiangling: {
    comboNotation: 'Q E',
    description:
      'Combo padrão off-field KQM: Supremo Pyronado (12 giros) + Guoba (4 chamas).',
    sourceUrl: 'https://keqingmains.com/q/xiangling-quickguide/',
    steps: [
      step(1, ['burst', 'dmg1'], 'Q — 1º Golpe'),
      step(1, ['burst', 'dmg2'], 'Q — 2º Golpe'),
      step(1, ['burst', 'dmg3'], 'Q — 3º Golpe'),
      step(12, ['burst', 'dmgNado'], 'Q — Pyronado (12 giros)'),
      step(4, ['skill', 'press'], 'E — Guoba (4 chamas)'),
    ],
  },
  Xianyun: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/xianyun-quickguide/',
    steps: [
      step(1, ['burst', 'instantHeal'], 'Q — Cura'),
      step(1, ['burst', 'deviceHeal'], 'Q — Cura'),
      step(1, ['skill', 'trailDmg'], 'E — Habilidade (trailDmg)'),
      step(1, ['skill', 'firstLeapDmg'], 'E — Habilidade (firstLeapDmg)'),
      step(1, ['burst', 'instantDmg'], 'Q — Supremo (instantDmg)'),
      step(6, ['burst', 'coordinatedDmg'], 'Q — Supremo (coordinatedDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
    ],
  },
  Xiao: {
    comboNotation: '2[E] Q 10[hP]',
    description:
      'Combo padrão KQM: 2 Habilidades + Supremo + 10 Ataques Imersivos Altos.',
    sourceUrl: 'https://keqingmains.com/q/xiao-quickguide/',
    steps: [
      step(2, ['skill', 'press'], '2[E] — Habilidade Elemental'),
      step(10, ['plunging', 'high'], '10[hP] — 10 Ataques Imersivos Altos'),
    ],
  },
  Xilonen: {
    comboNotation: 'E N2 Q',
    description:
      'Combo padrão suporte KQM: E + 2 Ataques Normais para ativar Amostras + Supremo (cura).',
    sourceUrl: 'https://keqingmains.com/q/xilonen-quickguide/',
    steps: [
      step(1, ['burst', 'heal'], 'Q — Cura do Supremo'),
      step(1, ['skill', 'rushDmg'], 'E — Investida'),
      step(1, ['burst', 'skillDmg'], 'Q — Dano do Supremo'),
    ],
  },
  Xingqiu: {
    comboNotation: 'E Q',
    description:
      'Combo padrão off-field KQM: Habilidade + Supremo (ondas de Espadas de Chuva).',
    sourceUrl: 'https://keqingmains.com/q/xingqiu-quickguide/',
    steps: [
      step(1, ['skill', 'press1'], 'E — 1º Golpe'),
      step(1, ['skill', 'press2'], 'E — 2º Golpe'),
      step(36, ['burst', 'dmg'], 'Q — Espadas de Chuva (~36 espadas)'),
    ],
  },
  Xinyan: {
    comboNotation: 'E Q',
    description: 'Rotação padrão baseada no kit do personagem (E Q).',
    sourceUrl: 'https://keqingmains.com/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['skill', 'lvl3Dmg'], 'E — Habilidade (lvl3Dmg)'),
      step(1, ['burst', 'pressPhysDmg'], 'Q — Supremo (pressPhysDmg)'),
      step(6, ['burst', 'dotPyroDmg'], 'Q — Supremo (dotPyroDmg)'),
    ],
  },
  YaeMiko: {
    comboNotation: '3[E] Q 3[E]',
    description:
      'Combo padrão KQM: 3 Totens Sesshou Sakura + Supremo (3 relâmpagos) + 3 Totens.',
    sourceUrl: 'https://keqingmains.com/q/yae-quickguide/',
    steps: [
      step(
        15,
        ['skill', 'dmg3'],
        '3[E] — Totens Sesshou Sakura Nv.3 (15 ticks)'
      ),
      step(1, ['burst', 'dmg'], 'Q — Dano Inicial do Supremo'),
      step(3, ['burst', 'tenkoDmg'], 'Q — 3 Relâmpagos Tenko'),
    ],
  },
  Yanfei: {
    comboNotation: '3[N3C] N1 E C',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (3[N3C] N1 E C).',
    sourceUrl: 'https://keqingmains.com/q/yanfei-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', '0'], 'Combo — Ataque Carregado (0)'),
    ],
  },
  Yaoyao: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/yaoyao-quickguide/',
    steps: [
      step(1, ['skill', 'heal'], 'E — Cura'),
      step(1, ['burst', 'radishHeal'], 'Q — Cura'),
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(1, ['burst', 'radish'], 'Q — Supremo (radish)'),
    ],
  },
  Yelan: {
    comboNotation: 'E Q',
    description:
      'Combo padrão off-field KQM: Habilidade + Supremo + disparos coordenados.',
    sourceUrl: 'https://keqingmains.com/q/yelan-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Dano de Habilidade'),
      step(1, ['burst', 'pressDmg'], 'Q — Dano Inicial do Supremo'),
      step(36, ['burst', 'throwDmg'], 'Q — Dados Coordenados (~36 acertos)'),
    ],
  },
  Yoimiya: {
    comboNotation: 'E 3[N5]',
    description: 'Combo padrão KQM: Habilidade + 3 sequências completas de N5.',
    sourceUrl: 'https://keqingmains.com/q/yoimiya-quickguide/',
    steps: [
      step(6, ['normal', '0'], '3[N5] — 1º Golpe (2 flechas)'),
      step(3, ['normal', '1'], '3[N5] — 2º Golpe'),
      step(3, ['normal', '2'], '3[N5] — 3º Golpe'),
      step(6, ['normal', '3'], '3[N5] — 4º Golpe (2 flechas)'),
      step(3, ['normal', '4'], '3[N5] — 5º Golpe'),
    ],
  },
  YumemizukiMizuki: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/mizuki-quickguide/',
    steps: [
      step(1, ['skill', 'skillDmg'], 'E — Habilidade (skillDmg)'),
      step(1, ['skill', 'contDmg'], 'E — Habilidade (contDmg)'),
      step(1, ['burst', 'skillDmg'], 'Q — Supremo (skillDmg)'),
      step(6, ['burst', 'shockwaveDmg'], 'Q — Supremo (shockwaveDmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
  YunJin: {
    comboNotation: 'E Q',
    description: 'Rotação beginner-friendly baseada no Quick Guide KQM (E Q).',
    sourceUrl: 'https://keqingmains.com/q/yunjin-quickguide/',
    steps: [
      step(1, ['skill', 'dmg'], 'E — Habilidade (dmg)'),
      step(1, ['skill', 'dmg1'], 'E — Habilidade (dmg1)'),
      step(1, ['burst', 'dmg'], 'Q — Supremo (dmg)'),
      step(3, ['normal', '0'], 'Combo — 1º Golpe Normal'),
      step(3, ['normal', '1'], 'Combo — 2º Golpe Normal'),
      step(3, ['normal', '2'], 'Combo — 3º Golpe Normal'),
    ],
  },
  Zhongli: {
    comboNotation: 'hE (Q)',
    description:
      'Foco suporte KQM: Escudo de Jade (hE) + opcionalmente Supremo.',
    sourceUrl: 'https://keqingmains.com/q/zhongli-quickguide/',
    steps: [
      step(1, ['skill', 'shield'], 'hE — Absorção do Escudo de Jade'),
      step(1, ['skill', 'holdDMG'], 'hE — Dano de Habilidade Segurar'),
      step(1, ['burst', 'dmg'], 'Q — Dano do Meteoro'),
    ],
  },
  Zibai: {
    comboNotation: '4[N4E]',
    description:
      'Rotação beginner-friendly baseada no Quick Guide KQM (4[N4E]).',
    sourceUrl: 'https://keqingmains.com/q/zibai-quickguide/',
    steps: [
      step(1, ['skill', 'shift1Dmg'], 'E — Habilidade (shift1Dmg)'),
      step(1, ['skill', 'shift2Dmg'], 'E — Habilidade (shift2Dmg)'),
      step(1, ['burst', 'skill1Dmg'], 'Q — Supremo (skill1Dmg)'),
      step(1, ['burst', 'skill2Dmg'], 'Q — Supremo (skill2Dmg)'),
      step(6, ['plunging', 'high'], '6[hP] — Ataque Imersivo Alto'),
      step(3, ['charged', 'dmg'], 'Combo — Ataque Carregado (dmg)'),
    ],
  },
}
