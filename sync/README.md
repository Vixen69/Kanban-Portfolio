# sync/ — Sprint 5

Processus CLI séparé : tire depuis l'adaptateur actif (csv-import, puis
sciforma en lecture seule), écrit dans **PostgreSQL** (via le port
`BoardStorage`), se termine. Jamais intégré au middle web. Identifiants dans
un fichier hors dépôt, référencé par chemin. Rien n'est implémenté avant le
RP4.
