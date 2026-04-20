1. Module OAuth / Auth
Vue d’ensemble
Le système d’auth de l’extension Amazon Q semble être basé sur AWS SSO / IAM Identity Center / OIDC, avec deux modes principaux :

Authorization Code + PKCE
Device Authorization Flow
et un mécanisme de :

refresh token
cache local SSO
réauth pilotée par UI VS Code
Preuves principales
Vue login dans VS Code
Dans package.json:246-270 :

aws.amazonq.AmazonCommonAuth → webview login
aws.amazonq.AmazonQChatView → chat view
le chat n’apparaît que si aws.amazonq.showLoginView est faux
Ça montre que l’état d’auth pilote directement l’UI.

Activation par URI
Dans package.json:40-45 :

onUri
C’est un fort indice qu’un callback OAuth/SSO revient dans VS Code via URI.

UI d’auth
Dans package.nls.json:116-125 :

Add New Connection
Login with console credentials
Switch Connections
Sign Out
Connect to AWS
Ça confirme l’existence d’un vrai module de connexion multi-étapes.

Flows d’auth confirmés
A. Authorization Code + PKCE
Indices relevés dans dist/src/extensionWeb.js :

responseType:"code"
codeChallengeMethod:"S256"
redirectUri:this.redirectUri
grantType:"authorization_code"
Ce que ça signifie
L’extension web supporte un flow moderne :

ouverture navigateur,
login utilisateur,
retour avec code,
échange du code contre un token,
protection PKCE.
B. Device Authorization Flow
Indices relevés dans dist/src/extensionNode.js :

startDeviceAuthorization
deviceCode
userCode
verificationUri
verificationUriComplete
urn:ietf:params:oauth:grant-type:device_code
Ce que ça signifie
En mode desktop/Node, l’extension peut :

demander un device code,
afficher un code utilisateur,
ouvrir le navigateur,
attendre que l’utilisateur approuve,
échanger ensuite le device code contre un token.
C’est très typique du flux AWS SSO/OIDC.

Refresh token
Indices dans dist/src/extensionNode.js :

grantType:"refresh_token"
usage d’un refreshToken
Interprétation
Quand la session approche de l’expiration :

l’extension tente un refresh silencieux,
sinon elle force une réauth.
Cache local
Indices dans dist/src/extensionNode.js :

.aws/sso/cache
watcher *.json
lecture/écriture du cache
Conclusion
Le cache semble être le cache standard AWS SSO local, donc probablement :

Windows : %USERPROFILE%\.aws\sso\cache\
L’extension ne réinvente pas complètement le stockage de session :

elle réutilise l’écosystème SSO AWS.

Callback visuel OAuth
Fichier :

dist/src/auth/sso/vue/index.html
Cette page affiche :

Request approved
Request denied
Donc elle joue le rôle de landing page de callback après redirection navigateur.

2. API requests vers le serveur model / LLM
Vue d’ensemble
L’extension ne semble pas parler directement à une API générique style OpenAI chat/completions.

Elle embarque clairement une couche basée sur AWS Bedrock / runtime AWS interne, avec :

découverte de modèles,
requêtes non streaming,
requêtes streaming,
support tool use,
support MCP.
Couche protocole interne UI ↔ extension
Dans dist/src/extensionNode.js et dist/src/extensionWeb.js, on voit des commandes internes du style :

aws/chat/sendChatPrompt
aws/chat/sendInlineChatPrompt
aws/chat/sendChatUpdate
aws/chat/listAvailableModels
aws/chat/listMcpServers
aws/chat/mcpServerClick
Interprétation
Le flux probable est :

webview UI → protocole interne aws/chat/... → runtime extension → client backend/model

Donc l’UI n’appelle pas directement Bedrock ; elle passe par le runtime de l’extension.

Endpoints concrets visibles
Dans dist/src/extensionNode.js, on voit des URIs Bedrock explicites :

Découverte de modèles
GET /foundation-models
GET /foundation-models/{modelIdentifier}
Inférence non streaming
POST /model/{modelId}/converse
POST /model/{modelId}/invoke
Inférence streaming
POST /model/{modelId}/converse-stream
POST /model/{modelId}/invoke-with-response-stream
Ce que ça veut dire
Le runtime embarque au moins les clients Bedrock standards pour :

A. Discovery
Lister les modèles disponibles avec des champs comme :

modelId
modelName
providerName
responseStreamingSupported
inputModalities
outputModalities
B. Inference classique
Via :

invoke
converse
C. Inference streaming
Via :

converse-stream
invoke-with-response-stream
Support du streaming
Très fortement confirmé.

Indices de structure d’événements :

messageStart
contentBlockStart
contentBlockDelta
Ça ressemble à un pipeline Bedrock moderne avec flux incrémental de réponse.

Tool use
Le bundle contient des traces de :

toolConfig
toolUse
toolUses
toolResults
Interprétation
Le moteur de chat sait gérer :

demande d’outil par le modèle,
résultat d’outil,
persistance de ces résultats dans l’historique.
Donc on n’est pas sur un simple chat texte brut, mais sur une couche agentique/tool-enabled.

MCP
Indices explicites :

aws/chat/listMcpServers
aws/chat/mcpServerClick
mcpServers
Interprétation
L’extension sait :

lister des serveurs MCP,
exposer ces serveurs dans le chat,
probablement les utiliser comme sources d’outils/contexte.
Modèles
La découverte de modèles semble plutôt dynamique, pas codée en dur.

Mais un fallback concret a été identifié :

CLAUDE_SONNET_4_20250514_V1_0
label : Claude Sonnet 4
mapping backend : claude-sonnet-4
Donc on a une preuve qu’au moins un modèle Bedrock/Claude est embarqué dans cette logique.

3. Quotas, rate limits, subscription, limits
Vue d’ensemble
L’extension contient plusieurs indices forts de :

gating Free vs Pro
subscription management
throttling
token limits
service quota exceeded
usage telemetry
Mais je n’ai pas trouvé de grille complète chiffrée des quotas par plan.

Subscription / plan gating
Commande abonnement
Dans package.nls.json:141 :

Manage Q Developer Pro Subscription
Et dans package.json, la commande aws.amazonq.manageSubscription existe.

Interprétation
Il y a un contrôle explicite d’abonnement Pro dans le produit.

Distinction Free / Pro
Dans les bundles serveur, des chaînes observées indiquent :

free tier user - falling back to legacy mcp configuration
références à Pro Tier
Interprétation
Selon le tier :

certaines fonctionnalités changent,
probablement certaines intégrations avancées sont réduites ou remplacées.
Métadonnées de limites par modèle
Champs confirmés dans les bundles :

rateMultiplier
rateUnit
tokenLimits
supportedInputTypes
promptCaching / supportsPromptCache
Interprétation
La couche modèle ne renvoie pas juste un nom :
elle renvoie aussi des capacités et limites d’usage/contexte.

Token limits
Le fallback Claude Sonnet 4 observé inclut :

maxInputTokens: 200000
Donc au moins certains modèles exposent des token limits explicites.

Throttling et dépassement de quota
Des symboles/erreurs vus dans les bundles :

ThrottlingException
serviceQuotaExceededException
access token limit exceeded
Et côté UI/localisation :

message disant en substance que la requête est throttled
message précisant que la tentative ne comptera pas contre la limite d’usage
Interprétation
Le runtime gère explicitement :

surcharge/backoff,
quotas de service,
erreurs de dépassement de limite,
messages UX associés.
Usage tracking / telemetry
Dans package.json:85-89 :

amazonQ.telemetry
Dans package.nls.json:19 :

envoi de données d’usage à AWS
Interprétation
Il y a au minimum un suivi d’usage produit/télémétrie.

Ça ne prouve pas un dashboard utilisateur d’usage, mais ça prouve une collecte côté service.

4. Architecture reconstituée
Pipeline global probable
Étape 1 — Auth
l’utilisateur se connecte via AWS/OIDC/SSO
l’extension obtient des tokens
le cache est maintenu localement
Étape 2 — Activation du chat
la vue login disparaît
la vue Amazon Q chat devient disponible
Étape 3 — Envoi d’un prompt
la webview envoie une commande aws/chat/sendChatPrompt
le runtime choisit le contexte / modèle / options
Étape 4 — Appel modèle
Bedrock ou couche AWS runtime appelle :
converse
invoke
ou leurs variantes streaming
Étape 5 — Outils / MCP
si le modèle demande un tool use,
l’extension orchestre l’outil,
renvoie le résultat,
puis continue la conversation.
Étape 6 — Gating / limits
les modèles disponibles et certaines fonctions dépendent :
du tier utilisateur,
de l’abonnement,
du throttling,
des quotas et token limits.
5. Ce qu’on peut affirmer avec confiance
Confirmé
auth fondée sur AWS SSO/OIDC
support Authorization Code + PKCE
support Device Authorization
support refresh token
usage du cache local .aws/sso/cache
existence d’une vue login dédiée
protocole chat interne aws/chat/...
présence d’endpoints Bedrock :
/foundation-models
/model/{modelId}/converse
/model/{modelId}/invoke
variantes streaming
support tool use
support MCP
présence de gating Pro/Free
présence de token limits / throttling / quota exceeded
Prudence / inférence
le chaînage exact entre chaque commande aws/chat/... et chaque endpoint Bedrock n’est pas entièrement lisible sans déminifier plus profondément
je n’ai pas de table complète “plan → quota chiffré”
je n’ai pas de mapping exhaustif modèle/provider au-delà des preuves trouvées
6. Fichiers les plus utiles
Auth
package.json
package.nls.json
dist/src/auth/sso/vue/index.html
dist/src/extensionNode.js
dist/src/extensionWeb.js
LLM/API
dist/src/extensionNode.js
dist/src/extensionWeb.js
Quotas
package.nls.json
resources/language-server/servers/aws-lsp-codewhisperer.js
resources/language-server/clients/amazonq-ui.js
★ Insight ─────────────────────────────────────

Le point architectural le plus révélateur est que l’extension ne couple pas directement “UI chat = API LLM” : elle insère une couche runtime locale qui gère auth, sélection de modèle, streaming, tool use et gating.
C’est précisément cette couche intermédiaire qui permet à Amazon Q d’avoir à la fois une UX d’IDE, des outils locaux, et une gouvernance par abonnement/quotas.