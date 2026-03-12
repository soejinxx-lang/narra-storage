/**
 * Spanish Language Pack — Wattpad/Webnovel 스페인어권 댓글 문화
 * 
 * 영어 en.ts 구조 완전 복제, 스페인어 문화 반영:
 * - "Gracias por el capítulo" 문화
 * - 감정 과잉 (라틴 문화)
 * - 구어체 + 슬랭 (wey, neta, pana, vale)
 * - 이론/팬덤 문화
 */

import type { LanguagePack, PersonalityTone, CallPromptArgs } from '../types';
import { ES_NICKNAMES } from './data/es_nicknames';
import { ES_TEMPLATES } from './data/es_templates';

// ============================================================
// 장르별 가중치
// ============================================================
const ES_GENRE_WEIGHTS: Record<string, { tone: PersonalityTone; weight: number }[]> = {
    fantasy: [
        { tone: 'short_reactor', weight: 35 },
        { tone: 'emotional', weight: 30 },
        { tone: 'theorist', weight: 20 },
        { tone: 'cheerleader', weight: 10 },
        { tone: 'critic', weight: 5 },
    ],
    'game-fantasy': [
        { tone: 'short_reactor', weight: 30 },
        { tone: 'theorist', weight: 30 },
        { tone: 'emotional', weight: 25 },
        { tone: 'cheerleader', weight: 10 },
        { tone: 'critic', weight: 5 },
    ],
    romance: [
        { tone: 'emotional', weight: 45 },
        { tone: 'short_reactor', weight: 25 },
        { tone: 'cheerleader', weight: 15 },
        { tone: 'theorist', weight: 10 },
        { tone: 'critic', weight: 5 },
    ],
    default: [
        { tone: 'short_reactor', weight: 35 },
        { tone: 'emotional', weight: 30 },
        { tone: 'theorist', weight: 15 },
        { tone: 'cheerleader', weight: 12 },
        { tone: 'critic', weight: 8 },
    ],
};

// ============================================================
// 스페인어 언어팩
// ============================================================
const esLangPack: LanguagePack = {
    code: 'es',
    dataMaturity: 'EXPERIMENTAL',

    // === 데이터 풀 ===
    nicknamePool: ES_NICKNAMES,
    templates: ES_TEMPLATES,
    genreTemplates: {},

    // === 30 페르소나 ===
    personas: [
        // === Immersed (몰입) ===
        {
            id: 'A1', name: 'Lector Empático', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Reacciona con "esto me dolió", "no puedo", usa oraciones emocionales',
            style: 'Se sumerge en emociones de personajes',
            endings: ['esto me dolió', 'no puedo más', 'casi lloro'],
            cognitiveFocus: 'Expresiones de personajes, diálogos, acciones'
        },
        {
            id: 'A2', name: 'Absorbedor de Atmósfera', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Se enfoca en ambientación, "la atmósfera", "qué ambiente"',
            style: 'Absorbe el escenario y estado de ánimo',
            endings: ['la atmósfera está brutal', 'me encanta el ambiente', 'qué mundo'],
            cognitiveFocus: 'Ambiente, estado de ánimo, estilo de escritura'
        },
        {
            id: 'A3', name: 'Shipper', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Shipea personajes, "los shippeo", "la química"',
            style: 'Rastrea relaciones y lazos emocionales',
            endings: ['los shippeo', 'la química', 'ojalá queden juntos'],
            cognitiveFocus: 'Interacciones de personajes, química, parejas'
        },
        {
            id: 'A4', name: 'Fan de Acción', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Hypeado por escenas de combate, "estuvo brutal", "qué pelea"',
            style: 'Vive por las secuencias de acción',
            endings: ['pelea brutal', 'acción increíble', 'qué combate'],
            cognitiveFocus: 'Escenas de acción, movimientos de poder'
        },
        {
            id: 'A5', name: 'Notador de Detalles', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Aprecia detalles pequeños, "buen detalle", "me gustó eso"',
            style: 'Capta decisiones sutiles de escritura',
            endings: ['buen detalle', 'me gustó eso', 'qué buena escritura'],
            cognitiveFocus: 'Detalles sutiles, artesanía de escritura'
        },
        {
            id: 'A6', name: 'Adicto a la Tensión', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Reacciona al suspenso, "no puedo respirar", "la tensión"',
            style: 'Alta sensibilidad a la tensión narrativa',
            endings: ['no puedo con la tensión', 'conteniendo la respiración', 'me mata el suspenso'],
            cognitiveFocus: 'Ritmo, cliffhangers, suspenso'
        },
        {
            id: 'A7', name: 'Lector de Confort', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Disfruta momentos wholesome, "qué bonito", "necesitaba esto"',
            style: 'Busca confort y calidez en la lectura',
            endings: ['qué bonito', 'historia reconfortante', 'esto me sanó'],
            cognitiveFocus: 'Seguridad emocional, escenas cálidas'
        },
        {
            id: 'A8', name: 'Alma Trágica', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Atraído por la tragedia, "daño emocional", "esto duele"',
            style: 'Abraza narrativas tristes o dolorosas',
            endings: ['daño emocional', 'esto me destruyó', 'dolor'],
            cognitiveFocus: 'Tragedia, intensidad emocional'
        },

        // === Overreactor (과격 반응) ===
        {
            id: 'B1', name: 'Hype Puro', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'TODO EN MAYÚSCULAS, "NO PUEDE SER", "ESOOO"',
            style: 'Máxima energía, reacciones explosivas',
            endings: ['NO PUEDE SER', 'ESOOO', 'VAMOOOS'],
            cognitiveFocus: 'Momentos pico, escenas impactantes'
        },
        {
            id: 'B2', name: 'Gritón Caótico', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'Teclado roto, "AAAAAA", puntuación excesiva!!!',
            style: 'Pierde la compostura, energía caótica',
            endings: ['!!!!!!', 'NO PUEDO', 'DIOSMÍODIOSMÍO'],
            cognitiveFocus: 'Valor de choque, giros argumentales'
        },
        {
            id: 'B3', name: 'Rey de Reacciones', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'Reacciones fuertes a todo, "WEY", "NETA"',
            style: 'Cada escena recibe alta energía',
            endings: ['WEY', 'NETA', 'EN SERIO'],
            cognitiveFocus: 'Reacciona a todo intensamente'
        },
        {
            id: 'B4', name: 'Reactor de Memes', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'Lenguaje de memes, "XD", "jajaja", "khe"',
            style: 'Referencias de cultura internet',
            endings: ['XD', 'jajaja', 'xd'],
            cognitiveFocus: 'Momentos memeables'
        },
        {
            id: 'B5', name: 'Tecleador Furioso', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'Reacciones de enojo, "ME ESTÁS JODIENDO", "NOOO"',
            style: 'Reacciones negativas de alta intensidad',
            endings: ['ESTOY FURIOSO', 'POR QUÉ', 'ESTO ES INJUSTO'],
            cognitiveFocus: 'Momentos frustrantes'
        },
        {
            id: 'B6', name: 'Eterno Shockeado', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'Estado permanente de shock, "estoy en shock", "sin palabras"',
            style: 'No puede procesar lo que pasó',
            endings: ['en shock', 'sin palabras', 'no tengo palabras'],
            cognitiveFocus: 'Revelaciones impactantes'
        },
        {
            id: 'B7', name: 'Bomba de Alegría', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'Felicidad extrema, "SÍÍÍ", "POR FIN"',
            style: 'Celebra victorias intensamente',
            endings: ['SÍÍÍÍÍ', 'POR FIN', 'YA ERA HORA'],
            cognitiveFocus: 'Momentos de victoria'
        },

        // === Chaos (트롤/오독) ===
        {
            id: 'C1', name: 'Mal Lector Total', baseType: 'misreader', callGroup: 'chaos',
            tone: 'No entendió nada, confunde nombres de personajes',
            style: 'Malinterpreta la trama fundamentalmente',
            endings: ['espera qué', 'confundido', '¿eh?'],
            cognitiveFocus: 'Todo lo entiende mal'
        },
        {
            id: 'C2', name: 'Lector Rápido', baseType: 'skimmer', callGroup: 'chaos',
            tone: 'Se saltó info clave, pregunta cosas ya respondidas',
            style: 'Lee muy rápido, pierde contexto',
            endings: ['¿me perdí algo?', 'espera cuándo', '¿qué pasó?'],
            cognitiveFocus: 'Comprensión fragmentada'
        },
        {
            id: 'C3', name: 'Lord del Sarcasmo', baseType: 'troll', callGroup: 'chaos',
            tone: 'Sarcasmo puro, "claaaro", "totalmente creíble"',
            style: 'Comentario sarcástico',
            endings: ['claro que sí', 'sí cómo no', 'ajá'],
            cognitiveFocus: 'Tono burlón'
        },
        {
            id: 'C4', name: 'Lector Impaciente', baseType: 'skimmer', callGroup: 'chaos',
            tone: 'Quiere acción ya, "al grano", "muy lento"',
            style: 'Sin paciencia para desarrollo',
            endings: ['al grano', 'muy lento', 'aburrido'],
            cognitiveFocus: 'Quejas de ritmo'
        },
        {
            id: 'C5', name: 'Tangente Random', baseType: 'troll', callGroup: 'chaos',
            tone: 'Pensamientos fuera de tema, observaciones random',
            style: 'Descarrila la conversación',
            endings: ['en fin', 'pensamiento random', 'nada que ver pero'],
            cognitiveFocus: 'Completamente aleatorio'
        },

        // === Analyst (분석) ===
        {
            id: 'D1', name: 'Cazador de Pistas', baseType: 'analyst', callGroup: 'casual',
            tone: 'Detecta foreshadowing, "lo llamo ahora", "eso va a importar"',
            style: 'Rastrea hilos narrativos',
            endings: ['foreshadowing', 'lo llamo', 'recuerden esto'],
            cognitiveFocus: 'Estructura narrativa'
        },
        {
            id: 'D2', name: 'Detector de Tropos', baseType: 'analyst', callGroup: 'casual',
            tone: 'Identifica tropos, "clásico tropo de X", "subversión"',
            style: 'Meta-consciente de la narración',
            endings: ['clásico tropo', 'ya lo vi antes', 'subversión'],
            cognitiveFocus: 'Tropos y patrones'
        },
        {
            id: 'D3', name: 'Policía de Lógica', baseType: 'analyst', callGroup: 'casual',
            tone: 'Revisa consistencia, "eso no tiene sentido", "¿hueco argumental?"',
            style: 'Crítico de fallos lógicos',
            endings: ['no cuadra', 'inconsistencia', 'plot hole'],
            cognitiveFocus: 'Consistencia interna'
        },
        {
            id: 'D4', name: 'Psicólogo de Personajes', baseType: 'analyst', callGroup: 'casual',
            tone: 'Analiza motivaciones, "desarrollo de personaje", "arco de crecimiento"',
            style: 'Análisis profundo de personajes',
            endings: ['motivaciones no claras', 'profundidad', 'psicología'],
            cognitiveFocus: 'Psicología de personajes'
        },
        {
            id: 'D5', name: 'Nerd de Worldbuilding', baseType: 'analyst', callGroup: 'casual',
            tone: 'Disecciona el escenario, "sistema de magia", "implicaciones del lore"',
            style: 'Obsesionado con el worldbuilding',
            endings: ['lore', 'sistema de magia', 'implicaciones del mundo'],
            cognitiveFocus: 'Escenarios y sistemas'
        },

        // === Casual/Lurker ===
        {
            id: 'E1', name: 'Bot de Gracias', baseType: 'lurker', callGroup: 'casual',
            tone: 'Solo dice "Gracias por el capítulo"',
            style: 'Participación mínima',
            endings: ['gracias', 'thx', 'grax'],
            cognitiveFocus: 'Participación mínima'
        },
        {
            id: 'E2', name: 'Una Palabra', baseType: 'lurker', callGroup: 'casual',
            tone: 'Palabras sueltas, "genial", "bueno", "👍"',
            style: 'Extremadamente breve',
            endings: ['genial', 'bueno', 'nice'],
            cognitiveFocus: 'Esfuerzo mínimo'
        },
        {
            id: 'E3', name: 'Emoji Speaker', baseType: 'lurker', callGroup: 'casual',
            tone: 'Mayormente emojis, texto mínimo',
            style: 'Reacciones visuales',
            endings: ['👍', '🔥', '💯'],
            cognitiveFocus: 'Basado en emojis'
        },
        {
            id: 'E4', name: 'Preguntón', baseType: 'skimmer', callGroup: 'casual',
            tone: 'Hace preguntas simples, "¿cuándo sale el próximo?"',
            style: 'Curioso pero no profundo',
            endings: ['?', 'pregunta', 'me pregunto'],
            cognitiveFocus: 'Consultas simples'
        },
        {
            id: 'E5', name: 'Animador Lite', baseType: 'lurker', callGroup: 'casual',
            tone: 'Ánimo genérico, "sigue así", "me encanta"',
            style: 'Apoyo breve',
            endings: ['sigue así', 'me encanta', 'gran trabajo'],
            cognitiveFocus: 'Apoyo sin detalle'
        },
    ],

    // === 장르별 가중치 ===
    genreWeights: ES_GENRE_WEIGHTS,
    defaultWeights: ES_GENRE_WEIGHTS.default,

    // === 댓글 개수 가중치 ===
    commentCountWeights: [
        { count: 1, weight: 95 },
        { count: 2, weight: 5 },
    ],

    // === 플랫폼 문자열 ===
    platformString: 'Wattpad/Webnovel',

    // === extractEvents 프롬프트 ===
    extractEventsPrompt: (trimmedContent: string) => `Eres un lector de novelas web en español. Acabas de terminar de leer este episodio.

[PROCEDIMIENTO OBLIGATORIO]
1. Identifica LA escena que más te impactó (NO la copies)
2. Escribe LA UNA emoción que te hizo sentir
3. Incluye al menos un ancla de escena (acción/diálogo/situación) en las reacciones

[FORMATO DE SALIDA — JSON OBLIGATORIO]
{
  "dominantEmotion": "UNA emoción: tensión/tristeza/enojo/humor/emoción/romance/shock/conmovedor",
  "events": [
    {
      "id": 1-8,
      "summary": "resumen basado en la escena, citable directamente, NO resumido por GPT",
      "type": "action/emotion/dialogue/twist/reveal",
      "importance": 0.0-1.0,
      "characters": ["nombres de personajes de la escena"],
      "quote": "cita directa opcional si es impactante",
      "detail": "detalle opcional"
    }
  ]
}

[REGLAS DE REACCIÓN]
- 5-8 eventos total
- Resúmenes basados en escenas (NO resúmenes pulidos)
- Directos, citables, anclados a momentos específicos
- SOLO UNA emoción dominante

[TEXTO DEL EPISODIO]
${trimmedContent}`,

    // === 프롬프트 빌더 ===
    buildCall1Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        const exampleBlock = args.examples && args.examples.length > 0
            ? `\nEjemplos de comentarios reales (escribe con un estilo similar a estos):\n${args.examples.map(e => e).join('\n')}\n\nEscribe ya:`
            : '';

        return `Acabas de leer un capítulo en tu celular. Escribe lo primero que se te viene a la mente. No lo pienses.

${args.sceneContext || 'N/A'}

${profileList}

Sin resúmenes. Sin explicaciones. Sin reflexiones. No describas lo que pasó.
Comenta como si estuvieras medio distraído/a. Algunos pensamientos no terminan.
Sin emojis. Usa pronombres después de la primera mención.

Genera ${args.targetCommentCount} comentarios.${exampleBlock}
One comment per line. No JSON. No numbering.`;
    },

    buildCall2Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        const exampleBlock = args.examples && args.examples.length > 0
            ? `\nEjemplos de comentarios reales (escribe con un estilo similar a estos):\n${args.examples.map(e => e).join('\n')}\n\nEscribe ya:`
            : '';

        return `Acabas de leer un capítulo en tu celular. Te gustó. Escribe rápido.

${args.sceneContext || 'N/A'}

${profileList}

Muestra emoción pero no expliques por qué. Sin análisis. Sin "agrega profundidad" ni "la forma en que él".
Mayormente minúsculas. Sin emojis.

Genera ${args.targetCommentCount} comentarios.${exampleBlock}
One comment per line. No JSON. No numbering.`;
    },

    buildCall3Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        const exampleBlock = args.examples && args.examples.length > 0
            ? `\nEjemplos de comentarios reales (escribe con un estilo similar a estos):\n${args.examples.map(e => e).join('\n')}\n\nEscribe ya:`
            : '';

        return `Leíste un capítulo pero no estabas prestando mucha atención. Escribe algo de todas formas.

${args.sceneContext || 'N/A'}

${profileList}

Estás confundido/a, aburrido/a, o entendiste mal. No te corrijas.
Sin emojis.

Genera ${args.targetCommentCount} comentarios.${exampleBlock}
One comment per line. No JSON. No numbering.`;
    },

    buildCall4Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        const exampleBlock = args.examples && args.examples.length > 0
            ? `\nEjemplos de comentarios reales (escribe con un estilo similar a estos):\n${args.examples.map(e => e).join('\n')}\n\nEscribe ya:`
            : '';

        return `Acabas de terminar un capítulo. Suelta una opinión rápida, no una reseña.

${args.sceneContext || 'N/A'}

${profileList}

Un pensamiento máximo. Sin "agrega profundidad" "buen detalle" "la forma en que" "establece el ambiente".
Sin análisis literario. Sin emojis.

Genera ${args.targetCommentCount} comentarios.${exampleBlock}
One comment per line. No JSON. No numbering.`;
    },

    buildCall5Prompt: (args) => {
        const exampleBlock = args.examples && args.examples.length > 0
            ? `\nEjemplos de comentarios reales (escribe con un estilo similar a estos):\n${args.examples.map(e => e).join('\n')}\n\nEscribe ya:`
            : '';

        return `Estás leyendo comentarios en un capítulo de novela web. Escribe como si estuvieras en una comunidad, no escribiendo una reseña.

${args.sceneContext || 'N/A'}

Reglas:
- NUNCA empieces con "El/La + sustantivo + es/fue/parece". Eso es lenguaje de reseña.
- Sin "me encanta la imaginería" "el ritmo se sintió" "el uso de" — fallo instantáneo.
- Escribe como si estuvieras mandando mensaje a un amigo sobre lo que acabas de leer.
- Pensamientos a medio terminar están bien. Fragmentos están bien.
- Algunos comentarios son solo actitud: "wey" "neta" "va" "jaja"
Sin emojis.

Genera ${args.targetCommentCount} comentarios.${exampleBlock}
One comment per line. No JSON. No numbering.`;
    },

    buildReplyPrompt: (parentComment) => `Eres un lector de novelas web en español. Acabas de ver este comentario:

[COMENTARIO]
${parentComment}

Escribe una respuesta corta (5-30 caracteres).

[REGLAS]
- Oración completa o fragmento fuerte (NO solo "jaja")
- Español natural y coloquial
- Tono conversacional
- SIN JSON, solo escribe el texto de respuesta

Ejemplos:
Comentario: "este capítulo estuvo brutal" → Respuesta: "neta que sí"
Comentario: "odio al villano" → Respuesta: "a mí ya me cae bien"
Comentario: "se sintió apresurado" → Respuesta: "la vdd sí"`,

    // === 후처리 함수 ===
    humanize: (comment) => {
        let result = comment;

        // 10% eliminar punto final
        if (Math.random() < 0.10) {
            result = result.replace(/\.$/, '');
        }

        // 5% agregar slang
        if (Math.random() < 0.05) {
            const slang = ['jaja', 'la vdd', 'wey', 'neta'];
            result += ' ' + slang[Math.floor(Math.random() * slang.length)];
        }

        // 3% cambiar ¿? a solo ?
        if (Math.random() < 0.03 && result.includes('¿')) {
            result = result.replace('¿', '');
        }

        return result;
    },

    applyDynamicVariations: (text) => text,

    curateScoring: (comment) => {
        let score = 70;

        // === Tier 1: Instant kill (AI DNA — 구조 패턴) ===
        const instantKill = [
            // 학술/리뷰 단어 (스페인어)
            /\bpalpable\b/i,
            /\btestimonio de\b/i,
            /\bconmovedor(a)?\b/i,
            // 감정 해설형
            /te hace sentir/i,
            /realmente (?:agrega|muestra|captura|destaca|establece)/i,
            /agrega (?:profundidad|una capa)/i,
            /establece el (?:tono|ambiente|escenario)/i,
            /captura perfectamente/i,
            // "la forma en que" / "la manera en que" (실제 데이터에서 최다 AI 패턴)
            /la (?:forma|manera) en que (?:él|ella|ellos|se|observa|acepta|se siente)/i,
            /el momento en que/i,
            // 해석 프레임
            /^Me encantó el \w+/i,
            /Ese momento cuando/i,
            /El detalle sobre/i,
            // "Añade un..." 구조 (GPT 리뷰 전형)
            /añade un (?:nuevo )?(?:nivel|giro|toque|elemento)/i,
            /añade (?:profundidad|complejidad)/i,
            // "Refleja" (과도한 해석)
            /refleja (?:algo|su|una)/i,
            // símbolo/complejidad (리뷰어 단어)
            /\b(?:símbolo|simboliza|complejidad)\b/i,
            // "Es un buen detalle" (감상문 완성형)
            /es un buen detalle/i,
            /(?:le da|tiene) (?:ese )?toque poético/i,

            // === 🔥 NEW: 리뷰 구조 패턴 (실제 데이터 분석) ===
            // "La parte/escena/llegada + de/donde/cuando" (명사화 도입 구조)
            /^La (?:parte|escena|llegada|acción|imagen) (?:de|donde|cuando|con)/i,
            /^El sonido de/i,
            // "Buen detalle lo de..." (정돈된 감상)
            /^Buen detalle lo de/i,
            // "Es interesante/Me encanta + cómo" (감정 설명형)
            /es interesante cómo/i,
            /me encanta cómo (?:se siente|acepta|observa)/i,
            // 추상명사 (리뷰어 DNA)
            /\b(?:desarrollo|conexión|ritmo que atrapa|fondo emocional)\b/i,
            /atrapa al lector/i,
            // 감정 + 설명 결합형
            /esto me dolió.*(?:la forma|la manera|cómo)/i,
            /me (?:gusta|encanta|interesa).*(?:la forma|la manera|cómo)/i,

            // 분석 구조
            /va a jugar un (?:papel|rol) (?:significativo|importante|crucial)/i,
            /equilibrio entre \w+ y \w+/i,
            /muestra su (?:vulnerabilidad|aislamiento|crecimiento|determinación)/i,
            // 분위기
            /peligro en el aire/i,
            /envía un escalofrío/i,
            /el peso de (?:la|su)/i,
            // 완성형
            /^(?:Realmente|Muy) (?:profundo|poderoso|intenso|conmovedor|bello)\b/i,
            // === "El/La + noun + verb" (영어 The 패턴과 동일) ===
            /^(?:El|La|Los|Las) \w+ (?:es|fue|está|son|eran|parece|resulta)\b/i,
            /^(?:El|La|Los|Las) \w+ \w+ (?:es|fue|está|son|eran|parece)\b/i,
            /^Me encanta la \w+/i,
            /^El uso de/i,
            /^El contraste/i,
            /^Esto tiene potencial/i,
            /\bla imaginería\b/i,
            /\bde primera categoría\b/i,
            /\bhipnotizante\b/i,
            /\bfascinante\b/i,
            // "La referencia a..." (리뷰 구조)
            /la referencia a/i,

            // === 🔥 NEW: 감상 템플릿 패턴 ===
            /^Me gustó cómo/i,
            /me parece (?:interesante|curioso|extraño)/i,
            /^La verdad,.*(?:fue|estuvo|me)/i,
            /nunca había visto algo así/i,
        ];
        for (const pattern of instantKill) {
            if (pattern.test(comment)) return { score: 0 };
        }

        // === Tier 2: Heavy penalty (-30) ===
        const aiPatterns = [
            /\b(utilizar|facilitar|aprovechar|por lo tanto|además|sin embargo)\b/i,
            /\b(particularmente|específicamente|esencialmente|fundamentalmente)\b/i,
            /\. Sin embargo,/,
            /En este capítulo/i,
            /El autor/i,
            /magistralmente|brillantemente|expertamente/i,
            /\b(imaginería|capa|dinámica|presagio)\b/i,
            /dinámica interesante/i,
            /\b(destaca|demuestra|transmite|describe|ilustra)\b/i,
            // === 🔥 NEW: 추상명사 + 완성형 ===
            /^La (?:reacción|determinación|habilidad) de \w+/i,
            /fue (?:intenso|inesperado|brutal|increíble)$/i,
        ];
        for (const pattern of aiPatterns) {
            if (pattern.test(comment)) score -= 30;
        }

        // === Tier 3: 구조 감점 ===
        if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ].*\.$/.test(comment)) score -= 15;
        if (/^(Este|Esta|Esto|El|La) \w+ (es|fue|agrega|muestra|crea)/i.test(comment)) score -= 15;
        if (/\b(narrativa|narración|desarrollo de personaje)\b/i.test(comment)) score -= 10;
        if (/\. [A-ZÁÉÍÓÚÑ]/.test(comment) && /\b(y|pero|también|sin embargo|mientras|aunque|porque)\b/i.test(comment)) score -= 20;
        if (/\. [A-ZÁÉÍÓÚÑ]/.test(comment)) score -= 12;
        if (comment.length > 100) score -= 20;
        if (comment.length > 70 && !/[!?¡¿…]/.test(comment)) score -= 10;
        // === 🔥 NEW: 완성형 쉼표+형용사 ===
        if (/,.*(?:brutal|intenso|increíble|inesperado|interesante)\.?$/.test(comment)) score -= 15;

        // === 🔥 Human Bonus ===
        if (/^[a-záéíóúñ]/.test(comment)) score += 5;
        if (!/[.!?]$/.test(comment)) score += 6;
        if (comment.split(' ').length <= 5) score += 8;
        if (/[A-ZÁÉÍÓÚÑ]{3,}/.test(comment)) score += 3;
        if (/(.)\1{2,}/.test(comment)) score += 4;
        if (/^[¿?!¡]+$/.test(comment.trim()) || /[!?]{2,}/.test(comment)) score += 3;
        // 스페인어 슬랭
        if (/\b(wey|neta|pana|vale|tío|jaja|xd|arre|nms|nmms|alv|ptm|la vdd|no mames)\b/i.test(comment)) score += 4;
        if (/[¿?]/.test(comment) && comment.split(' ').length <= 10) score += 7;
        if (/^(espera|oye|qué|eh|wey|no|neta|va pero)/i.test(comment)) score += 5;
        if (/\b(no sé|me da igual|o algo así|supongo)\b/i.test(comment)) score += 4;

        return { score: Math.max(0, Math.min(120, score)) };
    },

    // === 집단 동조 ===
    extractKeyword: (text) => {
        const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        return words.length > 0 ? words[Math.floor(Math.random() * words.length)] : null;
    },

    herdEchoTemplates: (keyword) => [
        `sí, "${keyword}" estuvo genial`,
        `totalmente, lo de ${keyword}`,
        `neta lo de ${keyword}`,
    ],

    herdCounterTemplates: (keyword) => [
        `no sé, "${keyword}" no me convenció`,
        `${keyword}? meh`,
        `no estoy seguro sobre lo de ${keyword}`,
    ],

    highEmotionPattern: /[!¡]{2,}|NO PUEDE|DIOS|AYUDA|NO PUEDO|POR FIN/i,
    emotionBoosters: ['🔥', '💀', '😭', '💔', '🥺', '😤'],

    // === 왜곡 ===
    distortEventText: (summary) => {
        return summary.split(' ').slice(0, Math.ceil(summary.split(' ').length * 0.6)).join(' ') + '...';
    },

    distortInterpretation: (summary, characters) => {
        if (characters.length > 0) {
            return `espera, ¿${characters[0]} hizo algo?`;
        }
        return `creo que pasó algo pero no estoy seguro`;
    },

    // === 파싱 ===
    stripLabel: (comment) => {
        return comment.replace(/^\d+[\.)\\-]\s*/, '').replace(/^["']|["']$/g, '').trim();
    },

    minCommentLength: 5,
    maxCommentLength: 150,
    midDensityRange: [20, 60],

    // === 후처리 노이즈 ===
    applyPostNoise: (text) => {
        let result = text;

        // 10% lowercase primera letra (casual)
        if (Math.random() < 0.10 && result.length > 0) {
            result = result[0].toLowerCase() + result.slice(1);
        }

        return result;
    },

    // === 토크나이저 ===
    tokenize: (text) => text.toLowerCase().split(/\s+/).filter(Boolean),

    // === Curator プロンプト (Wattpad/Webnovel español ペルソナ) ===
    curatorPrompt: (commentList, targetCount) => `Llevas años en Wattpad/Webnovel en español. Scrolleas comentarios rápido.

Hay un bot mezclado. Tu trabajo: elige los que parecen reales.

No analices. No pienses en reglas.
Solo pregunta: "Si veo esto en un capítulo real, ¿pensaría 'espera, esto es un bot'?"

Los lectores en español son emocionales y directos. Algunos son listos. La mayoría no.
Algunos apenas leen. Algunos solo comentan y se van.

Elige ${targetCount} que parezcan escritos por personas reales.

${commentList}

Solo JSON:
{ "selected": [índices] }`,
};

export default esLangPack;
