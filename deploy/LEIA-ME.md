# Publicação gratuita — preparação

Status: aplicação preparada; servidor, DNS e HTTPS ainda não provisionados.
O build Linux com R precisa ser validado no servidor antes de compartilhar o link.

1. Criar conta em https://signup.cloud.oracle.com/ e manter Free Tier, sem upgrade pago.
2. Conferir no console os limites Always Free atuais e a disponibilidade. Escolher uma VM Ampere A1 Ubuntu com recursos dentro desses limites, considerando TODOS os recursos da conta. Não usar o crédito temporário como critério de gratuidade. Não criar recursos com cobrança estimada.
3. Instalar Docker Engine e Compose seguindo a documentação oficial para Ubuntu. Enviar apenas os arquivos do projeto; não enviar planilhas reais, .env, logs, node_modules ou .r-library locais.
4. Associar um hostname DNS gratuito ao IP público. Liberar TCP 80 e 443 na rede Oracle e no firewall da VM; restringir SSH. Não abrir 3000.
5. Copiar deploy/Caddyfile.example para deploy/Caddyfile e definir o hostname. Para cada pessoa, executar `docker run --rm -it caddy:2 caddy hash-password`, informar uma senha forte no prompt e colocar apenas o hash no Caddyfile. Usar usuários diferentes para isolar as importações.
6. Executar `docker compose build` e depois `docker compose up -d`. O primeiro build do R pode demorar bastante e exige acesso à internet. O cache CNEFE fica em volume persistente.
7. Verificar HTTPS válido, login das três pessoas, importação real com CNEFE, exportação, isolamento entre usuários e consumo de memória/disco antes de distribuir o link.

Não há garantia de disponibilidade no plano gratuito: a Oracle pode recuperar máquinas ociosas e pode não ter capacidade disponível. Não contratar alternativa paga automaticamente.

Conversões: uma ativa e até duas aguardando. O navegador precisa ficar aberto. Importações ficam na memória por 30 minutos, no máximo três/350 MB no total; reinício ou remoção por limite exige novo envio. Cache CNEFE e certificados persistem; volumes não são backup. O serviço reinicia após reinício da VM, mas a fila não sobrevive a reinício.

PROXY_AUTH=1 confia na identidade enviada pelo Caddy. É seguro apenas com a aplicação sem porta pública, como neste Compose. Não expor o processo Node diretamente. Login usa o diálogo de autenticação do navegador sobre HTTPS; para trocar usuário, usar outro perfil/janela privada.

Fontes: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm ; https://docs.docker.com/engine/install/ubuntu/ ; https://caddyserver.com/docs/automatic-https ; https://ipea.github.io/geocodebr/
