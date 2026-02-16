/**
 * 스페인어 댓글 템플릿 — Wattpad/Webnovel 스페인어권 문화 기반
 * 라틴아메리카 + 스페인 커뮤니티 말투
 */

import type { PersonalityTone } from '../../types';

export const ES_TEMPLATES: Record<PersonalityTone, string[]> = {
    // === SHORT_REACTOR (55%) — 짧은 반응 ===
    short_reactor: [
        'Gracias por el capítulo',
        'Gracias por el cap!',
        'Gracias por el cap ❤️',
        'Buen capítulo',
        'Buen cap',
        'Genial',
        'Me encantó',
        'Increíble',
        'Tremendo',
        'Buenísimo',
        'Qué bueno',
        'Wow',
        'Primero!',
        '👏👏👏',
        'Excelente como siempre',
        'Otro gran capítulo',
        'Amo esta novela',
        'Simplemente genial',
        'sigo leyendo',
        'no puedo parar de leer',
    ],

    // === EMOTIONAL (20%) — 감정 반응 ===
    emotional: [
        'no puedo con esto',
        'estoy llorando',
        'me rompió el corazón',
        'nooo por qué',
        'no estaba preparado/a para esto',
        'casi lloro',
        'me dio escalofríos',
        'tengo un nudo en la garganta',
        'esto me dolió',
        'ay mi corazón',
        'esto es demasiado',
        'me muerooo',
        'quiero llorar',
        'qué dolor',
        'no pueden hacerme esto',
        'estoy temblando',
        'la emoción que sentí',
        'necesito un momento',
        'dios mío',
        'no puedo más',
    ],

    // === THEORIST (10%) — 이론/분석 ===
    theorist: [
        'lo sabía',
        'lo vi venir',
        'esto va a ser importante',
        'apuesto a que va a pasar algo',
        'eso fue pista',
        'el autor planeó todo esto',
        'esto conecta con lo de antes',
        'llamándolo ahora',
        'me huele a traición',
        'esto es un montaje',
        'foreshadowing puro',
        'ya sé cómo termina',
        'nadie lo vio venir',
        'teoría: este personaje va a',
        'el desarrollo del personaje está brutal',
    ],

    // === CHEERLEADER (10%) — 응원/격려 ===
    cheerleader: [
        'sigue así!',
        'esta historia es increíble',
        'merece más lectores',
        'mejor novela que he leído',
        'no puedo dejar de leerla',
        'cada capítulo es mejor',
        'esto necesita más reconocimiento',
        'autor/a eres un crack',
        'joya escondida',
        'estoy enganchado/a',
        'necesito más capítulos',
        'esto es arte',
        'la mejor que hay aquí',
        'escribes muy bien',
        'tu escritura es adictiva',
    ],

    // === CRITIC (5%) — 비판 ===
    critic: [
        'capítulo muy corto',
        'se sintió apresurado',
        'quiero más',
        'un poco lento este cap',
        'el ritmo está raro',
        'el final fue muy abrupto',
        'necesita más desarrollo',
        'me dejó con ganas de más',
        'la transición fue rara',
        'se sintió como relleno',
        'podría ser más largo',
    ],
};
