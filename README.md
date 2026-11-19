# Tips Analytics — Dashboard no GitHub Pages

Dashboard interativo com as **cinco visualizações** do dataset público Tips, reproduzidas a partir de um notebook Python.

**Site:** https://thiagoishie.github.io/githubpages/
**Repositório:** https://github.com/thiagoishie/githubpages

## Tecnologias

- **Python + Plotly Express:** exploração inicial no notebook `EDA.ipynb`.
- **Parquet:** `data/tips.parquet`, com 244 registros e 7 colunas.
- **DuckDB-Wasm:** consulta SQL ao Parquet diretamente no navegador.
- **Plotly.js:** gráficos interativos e responsivos.
- **HTML + CSS + JavaScript:** interface e filtros, sem backend.
- **GitHub Pages:** hospedagem estática.

## Gráficos e filtros

1. Dispersão: conta × gorjeta (cor por dia, tamanho por pessoas).
2. Barras: faturamento por dia.
3. Boxplot: distribuição de gorjetas por dia e período.
4. Histograma: distribuição dos valores das contas por período.
5. Treemap: faturamento por dia e período, com cor pela taxa de gorjeta.

Filtros combinados por **dia, período, sexo, fumante e quantidade de pessoas**. Os KPIs e gráficos atualizam a partir das consultas SQL executadas no navegador.

## Estrutura

```text
githubpages/
├── index.html
├── style.css
├── app.js
├── data/
│   └── tips.parquet
├── EDA.ipynb
├── requirements.txt
└── README.md
```

## Publicar no GitHub Pages

1. Coloque todos os arquivos na branch `main`, preservando a pasta `data`.
2. Em **Settings → Pages**, selecione **Deploy from a branch**.
3. Selecione **main** e **/(root)** e salve.
4. Acesse https://thiagoishie.github.io/githubpages/.

O site usa caminhos relativos; funciona mesmo em um GitHub Pages de projeto (`/githubpages/`). A primeira abertura exige internet para baixar Plotly.js e DuckDB-Wasm de CDNs.

## Executar localmente

Na pasta do projeto:

```bash
python -m http.server 8000
```

Acesse http://localhost:8000. Abrir `index.html` via `file://` **não funciona**, pois o navegador bloqueia o carregamento de módulos e dados nesse contexto.

## Reproduzir os dados em Python (opcional)

```bash
python -m venv .venv
source .venv/bin/activate  # Linux / macOS
pip install -r requirements.txt
python -c "import plotly.express as px; px.data.tips().to_parquet('data/tips.parquet', index=False)"
```

O `requirements.txt` é **apenas para Python/notebook**. O GitHub Pages não instala dependências Python.

## Segurança e observações

- **Os dados são fictícios/demonstrativos do Plotly** e não representam dados de produção.
- O Parquet está publicado e acessível a qualquer pessoa. **Não publique informações corporativas, pessoais ou confidenciais em um repositório público.**
- O dataset usa valores monetários em **USD**, não BRL.
- DuckDB-Wasm usa execução no navegador, normalmente single-thread no GitHub Pages.
