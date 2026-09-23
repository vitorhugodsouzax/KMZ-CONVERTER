# Conversor de cobertura

## Platform
web

## Stack
Node.js, Fastify e TypeScript, solicitados pelo usuário. Frontend simples em HTML/CSS e TypeScript.

## Users
Equipe que recebe arquivos KML/KMZ de operadoras e precisa conferir dados antes de importar para PostgreSQL.

## Product Purpose
Enviar um lote de KML/KMZ, completar lacunas de endereço com o CNEFE, conferir registros e baixar XLSX. O usuário escolheu explicitamente uma tela simples, sem histórico.

## Capabilities and Constraints
Preservar coordenadas e atributos disponíveis. Campos originais têm prioridade; o geocodebr associa o endereço CNEFE mais próximo e sempre expõe distância e método da coordenada para que aproximações sejam auditáveis. Não inferir faixas. Esta versão não escreve no banco. Não há arquivo real fornecido; exemplos devem ser identificados como fictícios.

## Operating Context
Primeira versão local; integração com autenticação e infraestrutura do backend existente é uma etapa futura.
