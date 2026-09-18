/* ============================================================================
   Wizard BDE — Navegacao, API e Gamificacao
   ============================================================================ */

const estado = {
    stepAtual: 0,
    totalSteps: 8,
    resultadoApi: null,
    respostas: {
        etapas_selecionadas: [],
        etapa_ai: null,
        etapa_af: null,
        etapa_em: null,
        reduziu_desigualdade: null,
        terco_menor_elementares: null,
        participacao_maior_80: null,
    },
};

document.addEventListener('DOMContentLoaded', () => {
    renderizarDots();
    atualizarUI();
});

function renderizarDots() {
    const c = document.getElementById('steps-dots');
    c.innerHTML = '';
    for (let i = 0; i < estado.totalSteps; i++) {
        const d = document.createElement('div');
        d.className = 'dot';
        d.id = `dot-${i}`;
        c.appendChild(d);
    }
}

function atualizarUI() {
    const { stepAtual, totalSteps } = estado;
    const percentual = Math.round((stepAtual / (totalSteps - 1)) * 100);

    const barra = document.getElementById('barra-progresso');
    barra.style.width = `${percentual}%`;

    document.getElementById('lbl-etapa').textContent = `Passo ${stepAtual + 1} de ${totalSteps}`;
    document.getElementById('lbl-progresso').textContent = `${percentual}%`;

    for (let i = 0; i < totalSteps; i++) {
        const dot = document.getElementById(`dot-${i}`);
        if (!dot) continue;
        dot.className = 'dot';
        if (i < stepAtual) dot.classList.add('completo');
        if (i === stepAtual) dot.classList.add('ativo');
    }

    document.querySelectorAll('.step').forEach(s => s.style.display = 'none');
    const stepEl = document.querySelector(`.step[data-step="${stepAtual}"]`);
    if (stepEl) {
        stepEl.style.display = 'flex';
        stepEl.style.flexDirection = 'column';
        stepEl.style.justifyContent = 'center';
        stepEl.style.animation = 'none';
        stepEl.offsetHeight;
        stepEl.style.animation = 'fadeSlideUp .35s ease-out';
    }

    const btnVoltar = document.getElementById('btn-voltar');
    const btnProximo = document.getElementById('btn-proximo');

    const ehResultado = stepAtual === 7;
    const ehResumo = stepAtual === 6;

    btnVoltar.style.display = stepAtual > 0 && !ehResultado ? 'flex' : 'none';

    if (ehResultado) {
        btnProximo.style.display = 'none';
    } else if (ehResumo) {
        btnProximo.style.display = 'flex';
        btnProximo.textContent = 'Ver Resultado';
        btnProximo.className = 'btn btn-resultado';
        btnProximo.disabled = false;
        btnProximo.onclick = () => {
            mostrarResultado(estado.resultadoApi);
        };
    } else {
        btnProximo.style.display = 'flex';
        btnProximo.textContent = 'Proximo';
        btnProximo.className = 'btn btn-proximo';
        btnProximo.disabled = !stepValido(stepAtual);
        btnProximo.onclick = proximo;
    }
}

function stepValido(step) {
    switch (step) {
        case 0: return estado.respostas.etapas_selecionadas.length > 0;
        case 1: return estado.respostas.etapa_ai !== null;
        case 2: return estado.respostas.etapa_af !== null;
        case 3: return estado.respostas.etapa_em !== null;
        case 4:
            return estado.respostas.reduziu_desigualdade !== null
                && estado.respostas.terco_menor_elementares !== null;
        case 5: return estado.respostas.participacao_maior_80 !== null;
        default: return true;
    }
}

function proximo() {
    if (!stepValido(estado.stepAtual)) return;

    if (estado.stepAtual === 5) {
        enviarSimulacao();
        return;
    }

    estado.stepAtual++;
    while (devePularStep(estado.stepAtual) && estado.stepAtual < 6) {
        estado.stepAtual++;
    }
    atualizarUI();
}

function voltar() {
    if (estado.stepAtual <= 0) return;
    estado.stepAtual--;
    while (devePularStep(estado.stepAtual) && estado.stepAtual > 0) {
        estado.stepAtual--;
    }
    atualizarUI();
}

function devePularStep(step) {
    if (step === 1) return !estado.respostas.etapas_selecionadas.includes('ai');
    if (step === 2) return !estado.respostas.etapas_selecionadas.includes('af');
    if (step === 3) return !estado.respostas.etapas_selecionadas.includes('em');
    return false;
}

function toggleOpcao(card) {
    const campo = card.dataset.campo;
    card.classList.toggle('selecionado');
    const chave = campo.replace('etapa_', '');
    const idx = estado.respostas.etapas_selecionadas.indexOf(chave);
    if (idx >= 0) {
        estado.respostas.etapas_selecionadas.splice(idx, 1);
        estado.respostas[campo] = null;
    } else {
        estado.respostas.etapas_selecionadas.push(chave);
        estado.respostas[campo] = {};
    }
    atualizarUI();
}

function toggleSimNaoPergunta(btn) {
    const campo = btn.dataset.campo;
    const valor = btn.dataset.valor === 'true';

    btn.parentElement.querySelectorAll('.btn-simnao').forEach(b => b.classList.remove('selecionado'));
    btn.classList.add('selecionado');

    estado.respostas[campo] = valor;
    atualizarUI();
}

function toggleSimNao(card, valor) {
    card.parentElement.querySelectorAll('.opcao-card').forEach(c => c.classList.remove('selecionado'));
    card.classList.add('selecionado');
    estado.respostas.participacao_maior_80 = valor;
    atualizarUI();
}

function validarInputsEtapa(prefixo) {
    const mat = parseFloat(document.getElementById(`inp-${prefixo}-mat`).value);
    const meta = parseFloat(document.getElementById(`inp-${prefixo}-meta`).value);
    const res = parseFloat(document.getElementById(`inp-${prefixo}-res`).value);
    if (!mat || mat <= 0 || isNaN(meta) || isNaN(res) || meta <= 0 || res <= 0) {
        mostrarErro('Preencha todos os campos com valores validos (maiores que zero).');
        return null;
    }
    return { matriculas: Math.round(mat), meta, resultado: res };
}

document.addEventListener('focusout', (e) => {
    if (!e.target.matches('.input-campo input')) return;
    const step = e.target.closest('.step');
    if (!step) return;
    const stepNum = parseInt(step.dataset.step);
    let prefixo = null;
    if (stepNum === 1) prefixo = 'ai';
    if (stepNum === 2) prefixo = 'af';
    if (stepNum === 3) prefixo = 'em';
    if (!prefixo) return;
    const dados = validarInputsEtapa(prefixo);
    if (dados) {
        estado.respostas[`etapa_${prefixo}`] = dados;
    } else {
        estado.respostas[`etapa_${prefixo}`] = null;
    }
    atualizarUI();
});

async function enviarSimulacao() {
    const btn = document.getElementById('btn-proximo');
    btn.disabled = true;
    btn.textContent = 'Calculando...';

    const payload = {};
    if (estado.respostas.etapas_selecionadas.includes('ai')) payload.etapa_ai = estado.respostas.etapa_ai;
    if (estado.respostas.etapas_selecionadas.includes('af')) payload.etapa_af = estado.respostas.etapa_af;
    if (estado.respostas.etapas_selecionadas.includes('em')) payload.etapa_em = estado.respostas.etapa_em;
    payload.reduziu_desigualdade = estado.respostas.reduziu_desigualdade;
    payload.terco_menor_elementares = estado.respostas.terco_menor_elementares;
    payload.participacao_maior_80 = estado.respostas.participacao_maior_80;

    try {
        const resp = await fetch('/api/v1/simular-bde', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Erro ao calcular BDE.');
        }
        estado.resultadoApi = await resp.json();
        mostrarResumo();
    } catch (e) {
        mostrarErro(e.message);
        btn.disabled = false;
        btn.textContent = 'Proximo';
    }
}

function montarResumo() {
    const r = estado.respostas;
    const etapasNomes = { ai: 'Anos Iniciais', af: 'Anos Finais', em: 'Ensino Medio' };
    let html = '<h2 class="resumo-titulo">Resumo das Informacoes</h2>';

    r.etapas_selecionadas.forEach(chave => {
        const dados = r[`etapa_${chave}`];
        if (dados) {
            const variacao = (dados.resultado - dados.meta).toFixed(2);
            const sinal = parseFloat(variacao) >= 0 ? '+' : '';
            html += `
                <div class="resumo-item ${parseFloat(variacao) >= 0 ? 'sim' : 'nao'}">
                    <div class="resumo-icone">${parseFloat(variacao) >= 0 ? '+' : '-'}</div>
                    <div class="resumo-texto">
                        <strong>${etapasNomes[chave]}</strong> — Meta: ${dados.meta} | Resultado: ${dados.resultado} | Variacao: ${sinal}${variacao}
                    </div>
                </div>`;
        }
    });

    const eq = r.reduziu_desigualdade;
    const el = r.terco_menor_elementares;
    const part = r.participacao_maior_80;

    html += `
        <div class="resumo-item ${eq ? 'sim' : 'nao'}">
            <div class="resumo-icone">${eq ? '+' : '-'}</div>
            <div class="resumo-texto"><strong>Equidade:</strong> ${eq ? 'Houve evolucao de PPI e renda/NSE' : 'Nao houve evolucao de equidade'}</div>
        </div>
        <div class="resumo-item ${el ? 'sim' : 'nao'}">
            <div class="resumo-icone">${el ? '+' : '-'}</div>
            <div class="resumo-texto"><strong>Elementares:</strong> ${el ? 'Escola esta no 1 terco com menor % de elementares' : 'Escola nao esta no 1 terco'}</div>
        </div>
        <div class="resumo-item ${part ? 'sim' : 'nao'}">
            <div class="resumo-icone">${part ? '+' : '-'}</div>
            <div class="resumo-texto"><strong>Participacao:</strong> ${part ? 'Atingiu >= 80% no SAEPE' : 'Nao atingiu 80% de participacao'}</div>
        </div>`;

    const motivos = [];
    if (r.etapas_selecionadas.length > 0) {
        const diffs = r.etapas_selecionadas.map(k => {
            const d = r[`etapa_${k}`];
            return d ? d.resultado - d.meta : 0;
        });
        const media = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        if (media >= 0.4) motivos.push('superou a meta em 0.4 pontos ou mais');
        else if (media >= 0.1) motivos.push('superou a meta');
        else if (media >= 0) motivos.push('atingiu ou esta proximo da meta');
        else motivos.push('ficou abaixo da meta');
    }
    if (eq) motivos.push('reduziu desigualdades de PPI e renda');
    if (el) motivos.push('esta entre as escolas com menor % de estudantes nos padroes elementares');
    if (part) motivos.push('atingiu participacao igual ou superior a 80%');

    if (motivos.length > 0) {
        html += `
            <div class="resumo-motivo">
                <strong>Por que sua escola pode receber o BDE?</strong><br>
                Porque ${motivos.join(', ')}.
            </div>`;
    }

    return html;
}

function mostrarResumo() {
    estado.stepAtual = 6;
    document.getElementById('resumo-area').innerHTML = montarResumo();
    atualizarUI();
}

function corKPI(valor) {
    if (valor >= 2.0) return 'kpi-verde';
    if (valor >= 1.0) return 'kpi-dourado';
    return 'kpi-vermelho';
}

function mostrarResultado(r) {
    estado.stepAtual = 7;
    atualizarUI();

    const apto = r.apto_a_receber;
    const badgeCor = apto
        ? (r.percentual_bde >= 2.0 ? 'var(--verde)' : r.percentual_bde >= 1.0 ? 'var(--dourado)' : 'var(--amarelo)')
        : 'var(--vermelho)';

    const clsIdepe = r.percentual_idepe >= 1.0 ? 'positivo' : r.percentual_idepe >= 0.75 ? 'neutro' : 'negativo';

    let etapasHtml = '';
    if (r.etapas && r.etapas.length > 0) {
        etapasHtml = '<div class="etapas-detalhe">';
        r.etapas.forEach(e => {
            const cls = e.variacao > 0 ? 'positivo' : e.variacao === 0 ? 'neutro' : 'negativo';
            const sinal = e.variacao > 0 ? '+' : '';
            etapasHtml += `
                <div class="etapa-detalhe">
                    <span class="etapa-nome">${e.nome}</span>
                    <span class="etapa-variacao ${cls}">${sinal}${e.variacao.toFixed(4)} (${(e.percentual_atingimento * 100).toFixed(0)}%)</span>
                </div>`;
        });
        etapasHtml += '</div>';
    }

    document.getElementById('resultado-area').innerHTML = `
        <div class="resultado-badge ${apto ? '' : 'badge-nao-apto'}" style="background: ${badgeCor}; color: white;">
            <span class="percentual">${r.percentual_formatado}</span>
            <span class="label-pct">BDE</span>
        </div>
        <h2 class="resultado-titulo">${apto ? 'Escola apta a receber o BDE' : 'Escola nao atingiu o minimo'}</h2>
        <p class="resultado-subtitulo">${apto
            ? 'Confira o detalhamento do calculo do seu bonus.'
            : 'A escola nao atingiu percentual minimo para receber o bonus.'}</p>
        <div class="detalhes-grid">
            <div class="detalhe-card">
                <div class="detalhe-valor ${clsIdepe}">${(r.percentual_idepe * 100).toFixed(0)}%</div>
                <div class="detalhe-label">IDEPE (media)</div>
            </div>
            <div class="detalhe-card">
                <div class="detalhe-valor">${(r.cota_resultado * 100).toFixed(0)}%</div>
                <div class="detalhe-label">Cota Resultado</div>
            </div>
            <div class="detalhe-card">
                <div class="detalhe-valor ${r.bonus_equidade > 0 ? 'positivo' : 'negativo-bg'}">${(r.bonus_equidade * 100).toFixed(0)}%</div>
                <div class="detalhe-label">Equidade</div>
            </div>
            <div class="detalhe-card">
                <div class="detalhe-valor ${r.bonus_elementares > 0 ? 'positivo' : 'negativo-bg'}">${(r.bonus_elementares * 100).toFixed(0)}%</div>
                <div class="detalhe-label">Elementares</div>
            </div>
            <div class="detalhe-card">
                <div class="detalhe-valor ${r.bonus_participacao > 0 ? 'positivo' : 'negativo-bg'}">${(r.bonus_participacao * 100).toFixed(0)}%</div>
                <div class="detalhe-label">Participacao</div>
            </div>
            <div class="detalhe-card">
                <div class="detalhe-valor">${(r.cota_bde_calculada * 100).toFixed(0)}%</div>
                <div class="detalhe-label">Cota BDE (antes part.)</div>
            </div>
        </div>
        ${etapasHtml}
        <button class="btn btn-reiniciar" onclick="reiniciar()">Simular outra escola</button>
    `;
}

function reiniciar() {
    estado.stepAtual = 0;
    estado.resultadoApi = null;
    estado.respostas = {
        etapas_selecionadas: [],
        etapa_ai: null,
        etapa_af: null,
        etapa_em: null,
        reduziu_desigualdade: null,
        terco_menor_elementares: null,
        participacao_maior_80: null,
    };
    document.querySelectorAll('.opcao-card').forEach(c => c.classList.remove('selecionado'));
    document.querySelectorAll('.btn-simnao').forEach(b => b.classList.remove('selecionado'));
    document.querySelectorAll('.input-campo input').forEach(i => i.value = '');
    document.getElementById('btn-proximo').style.display = 'flex';
    document.getElementById('btn-proximo').textContent = 'Proximo';
    document.getElementById('btn-proximo').className = 'btn btn-proximo';
    atualizarUI();
}

function mostrarErro(msg) {
    const toast = document.getElementById('toast-erro');
    toast.textContent = msg;
    toast.classList.add('visivel');
    setTimeout(() => toast.classList.remove('visivel'), 4000);
}
