"""
Serviço de cálculo do Bônus de Desempenho Educacional (BDE).

Arquitetura:
  - Tabela de conversão via bisect (O(log n), zero ifs encadeados)
  - Pipeline funcional com compose/reduce
  - Dataclasses imutáveis para configuração
  - Strategy pattern para bônus independentes

Referências de células (aba "Simulador BDE"):
  B21/B29/B37  → variação por etapa (Resultado − Meta)
  H47 / J9     → média ponderada das variações
  H45          → percentual IDEPE (tabela de conversão)
  B40/B41      → cota resultado / além do resultado
  B42/B43/B44  → cotas de equidade, elementares, participação
  C45          → cota do BDE (fórmula composta)
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass, field
from typing import Callable, Final, Sequence

from src.bde.schemas import (
    DetalheEtapa,
    EtapaIDEPE,
    RequisicaoBDE,
    RespostaBDE,
)


# ============================================================================
# Configuração — dataclasses imutáveis para constantes de negócio
# ============================================================================


@dataclass(frozen=True)
class FaixaConversao:
    """Uma faixa da tabela de conversão variação → percentual."""

    limite_inferior: float
    percentual: float


@dataclass(frozen=True)
class ConfiguracaoBDE:
    """Parâmetros configuráveis do cálculo BDE."""

    teto_cota: float = 2.5
    teto_final: float = 3.0
    bonus_equidade: float = 1.0
    bonus_elementares: float = 1.0
    bonus_participacao: float = 0.5


# ============================================================================
# Tabela de conversão — lookup via bisect (O(log n))
# ============================================================================


_TABELA_CONVERSAO: Final[list[FaixaConversao]] = [
    FaixaConversao(-0.3, 0.25),
    FaixaConversao(-0.2, 0.50),
    FaixaConversao(-0.1, 0.75),
    FaixaConversao(0.0, 1.00),
    FaixaConversao(0.1, 1.25),
    FaixaConversao(0.2, 1.50),
    FaixaConversao(0.3, 1.75),
    FaixaConversao(0.4, 2.00),
]

# Vetor de chaves para bisect (extrai os limites inferiores)
_CHAVES: Final[list[float]] = [f.limite_inferior for f in _TABELA_CONVERSAO]


def _buscar_percentual(variacao: float) -> float:
    """
    Busca binária na tabela de conversão.

    Usa bisect_right para encontrar a faixa correta em O(log n).
    Se a variação é menor que todos os limites, retorna 0.0.
    """
    if variacao < _CHAVES[0]:
        return 0.0
    indice = bisect.bisect_right(_CHAVES, variacao) - 1
    return _TABELA_CONVERSAO[indice].percentual


# ============================================================================
# Pipeline funcional — compose / reduce
# ============================================================================

# Tipo para funções de transformação de etapa
_FuncEtapa = Callable[[str, EtapaIDEPE], DetalheEtapa]


def _extrair_etapas(requisicao: RequisicaoBDE) -> list[tuple[str, EtapaIDEPE]]:
    """Extrai tuplas (chave, etapa) de todos os campos opcionais preenchidos."""
    campos = [
        ("ai", requisicao.etapa_ai),
        ("af", requisicao.etapa_af),
        ("em", requisicao.etapa_em),
    ]
    return [(chave, etapa) for chave, etapa in campos if etapa is not None]


def _avaliar_etapa(
    chave: str,
    etapa: EtapaIDEPE,
    *,
    conversor: Callable[[float], float] = _buscar_percentual,
) -> DetalheEtapa:
    """Avalia uma única etapa: calcula variação e converte em percentual."""
    variacao = round(etapa.resultado - etapa.meta, 4)
    percentual = conversor(variacao)
    return DetalheEtapa(
        nome=_NOMES_ETAPAS[chave],
        matriculas=etapa.matriculas,
        meta=etapa.meta,
        resultado=etapa.resultado,
        variacao=variacao,
        percentual_atingimento=percentual,
    )


def _calcular_media_ponderada(
    etapas: Sequence[DetalheEtapa],
) -> float:
    """Calcula a média ponderada das variações pelas matrículas."""
    total_matriculas = sum(e.matriculas for e in etapas)
    if total_matriculas == 0:
        return 0.0
    soma_produto = sum(e.variacao * e.matriculas for e in etapas)
    return round(soma_produto / total_matriculas, 4)


# ============================================================================
# Bônus independentes — strategy pattern
# ============================================================================


@dataclass(frozen=True)
class Bonus:
    """Representa um bônus independente do BDE."""

    nome: float
    valor: float
    ativo: bool


def _calcular_bonus(requisicao: RequisicaoBDE, config: ConfiguracaoBDE) -> list[Bonus]:
    """
    Calcula os bônus independentes.
    Retorna lista de bônus ativos e inativos (para transparência).
    """
    return [
        Bonus(
            nome="equidade",
            valor=config.bonus_equidade,
            ativo=requisicao.reduziu_desigualdade,
        ),
        Bonus(
            nome="elementares",
            valor=config.bonus_elementares,
            ativo=requisicao.terco_menor_elementares,
        ),
        Bonus(
            nome="participacao",
            valor=config.bonus_participacao,
            ativo=requisicao.participacao_maior_80,
        ),
    ]


def _soma_bonus_ativos(bonus: list[Bonus]) -> float:
    """Soma os valores dos bônus ativos."""
    return sum(b.valor for b in bonus if b.ativo)


# ============================================================================
# Cálculo da cota — pipeline puro
# ============================================================================


def _calcular_cota_bde(
    percentual_idepe: float,
    bonus: list[Bonus],
    config: ConfiguracaoBDE,
) -> tuple[float, float, float]:
    """
    Calcula a cota do BDE (C45 da planilha).

    Retorna:
        (cota_resultado, cota_alem_resultado, cota_bde_calculada)

    Fórmula:
        cota_bde = min(IDEPE + equidade + elementares, teto_cota)
    """
    cota_resultado = min(percentual_idepe, 1.0)
    cota_alem_resultado = max(percentual_idepe - cota_resultado, 0.0)

    bonus_eq_el = _soma_bonus_ativos(
        [b for b in bonus if b.nome in ("equidade", "elementares")]
    )
    soma_bonificada = percentual_idepe + bonus_eq_el
    cota_bde = round(min(soma_bonificada, config.teto_cota), 4)

    return cota_resultado, cota_alem_resultado, cota_bde


def _calcular_total(
    cota_bde: float,
    bonus: list[Bonus],
    config: ConfiguracaoBDE,
) -> float:
    """Calcula o percentual final com teto."""
    bonus_part = _soma_bonus_ativos(
        [b for b in bonus if b.nome == "participacao"]
    )
    return round(min(cota_bde + bonus_part, config.teto_final), 4)


# ============================================================================
# Nomes das etapas
# ============================================================================

_NOMES_ETAPAS: Final[dict[str, str]] = {
    "ai": "Anos Iniciais",
    "af": "Anos Finais",
    "em": "Ensino Médio",
}


# ============================================================================
# Classe principal — CalculadoraBDE
# ============================================================================


class CalculadoraBDE:
    """
    Calculadora do Bônus de Desempenho Educacional.

    Uso:
        calc = CalculadoraBDE()
        resultado = calc.calcular(requisicao)

    Ou com configuração customizada:
        config = ConfiguracaoBDE(teto_final=3.0)
        calc = CalculadoraBDE(config=config)
    """

    def __init__(self, config: ConfiguracaoBDE | None = None) -> None:
        self._config = config or ConfiguracaoBDE()

    def calcular(self, requisicao: RequisicaoBDE) -> RespostaBDE:
        """Executa o pipeline completo de cálculo do BDE."""

        # 1. Extrair e avaliar etapas
        etapas_entrada = _extrair_etapas(requisicao)
        detalhes = [_avaliar_etapa(chave, etapa) for chave, etapa in etapas_entrada]

        # 2. Média ponderada
        media = _calcular_media_ponderada(detalhes)

        # 3. Percentual IDEPE (conversão da média)
        percentual_idepe = _buscar_percentual(media)

        # 4. Bônus independentes
        bonus = _calcular_bonus(requisicao, self._config)

        # 5. Cota do BDE
        cota_res, cota_alem, cota_bde = _calcular_cota_bde(
            percentual_idepe, bonus, self._config
        )

        # 6. Total final
        total = _calcular_total(cota_bde, bonus, self._config)

        return RespostaBDE(
            percentual_bde=total,
            percentual_formatado=f"{total * 100:.0f}%",
            media_ponderada_variacao=media,
            percentual_idepe=percentual_idepe,
            bonus_equidade=_valor_bonus(bonus, "equidade"),
            bonus_elementares=_valor_bonus(bonus, "elementares"),
            bonus_participacao=_valor_bonus(bonus, "participacao"),
            cota_resultado=cota_res,
            cota_alem_resultado=cota_alem,
            cota_bde_calculada=cota_bde,
            apto_a_receber=total > 0.0,
            etapas=detalhes,
        )


def _valor_bonus(bonus: list[Bonus], nome: str) -> float:
    """Extrai o valor de um bônus pelo nome (0.0 se inativo)."""
    for b in bonus:
        if b.nome == nome:
            return b.valor if b.ativo else 0.0
    return 0.0


# ============================================================================
# Função de conveniência (API pública)
# ============================================================================


def calcular_bde(requisicao: RequisicaoBDE) -> RespostaBDE:
    """Função de conveniência — mantém compatibilidade com o router."""
    return CalculadoraBDE().calcular(requisicao)
