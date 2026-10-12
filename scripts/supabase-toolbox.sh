#!/usr/bin/env bash

# Toolbox Supabase per Passo Sicuro, adattata dallo script condiviso
# scripts/supabase-toolbox.sh del progetto volley_2026.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${SUPABASE_ENV_FILE:-$REPO_ROOT/.env.local}"

die() { printf 'Errore: %s\n' "$1" >&2; exit 1; }

# Carica solo le variabili necessarie, senza eseguire il file .env come shell.
load_env() {
  [[ -f "$ENV_FILE" ]] || return 0
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#${line%%[![:space:]]*}}"
    [[ -z "$line" || "${line:0:1}" == '#' || "$line" != *=* ]] && continue
    key="${line%%=*}"
    case "$key" in
      VITE_SUPABASE_URL|SUPABASE_PROJECT_REF|SUPABASE_ACCESS_TOKEN) ;;
      *) continue ;;
    esac
    [[ -n "${!key:-}" ]] && continue
    value="${line#*=}"
    value="${value%$'\r'}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then value="${value:1:${#value}-2}"; fi
    if [[ "$value" == \'*\' && "$value" == *\' ]]; then value="${value:1:${#value}-2}"; fi
    export "$key=$value"
  done < "$ENV_FILE"
}

load_env

command_path() {
  if command -v supabase >/dev/null 2>&1; then
    command -v supabase
  elif [[ -x "$REPO_ROOT/node_modules/.bin/supabase" ]]; then
    printf '%s' "$REPO_ROOT/node_modules/.bin/supabase"
  fi
}

require_cli() {
  local cli
  cli="$(command_path)"
  [[ -n "$cli" ]] || die 'Supabase CLI non trovata. Installala e riprova (https://supabase.com/docs/guides/cli).'
  SUPABASE_CLI="$cli"
}

project_ref() {
  if [[ -n "${SUPABASE_PROJECT_REF:-}" ]]; then
    printf '%s' "$SUPABASE_PROJECT_REF"
  else
    printf '%s' "${VITE_SUPABASE_URL:-}" | sed -nE 's#^https://([a-z0-9-]+)\.supabase\.co/?$#\1#p'
  fi
}

require_project_ref() {
  local ref
  ref="$(project_ref)"
  [[ -n "$ref" && "$ref" =~ ^[a-z0-9-]+$ ]] || die 'Progetto non riconosciuto: configura VITE_SUPABASE_URL in .env.local oppure SUPABASE_PROJECT_REF.'
  printf '%s' "$ref"
}

confirm() {
  local message="$1" answer
  if [[ "${DRY_RUN:-0}" == 1 ]]; then
    printf '%s\n' "$message" 'Dry-run: nessuna modifica eseguita.'
    return 2
  fi
  if [[ "${YES:-0}" == 1 ]]; then return 0; fi
  printf '\n%s\n' "$message"
  read -r -p '[E]segui / [A]nnulla: ' answer || return 1
  [[ "${answer,,}" == e ]]
}

ensure_linked() {
  local ref linked_ref_file linked_ref
  require_cli
  ref="$(require_project_ref)"
  if ! "$SUPABASE_CLI" projects list >/dev/null 2>&1; then
    printf '%s\n' 'Accesso CLI Supabase non disponibile; avvio il login.'
    "$SUPABASE_CLI" login
  fi
  linked_ref_file="$REPO_ROOT/supabase/.temp/project-ref"
  linked_ref=''
  [[ -f "$linked_ref_file" ]] && linked_ref="$(tr -d '[:space:]' < "$linked_ref_file")"
  if [[ "$linked_ref" != "$ref" ]]; then
    (cd "$REPO_ROOT" && "$SUPABASE_CLI" link --project-ref "$ref")
  else
    printf '✓ Progetto già collegato: %s\n' "$ref"
  fi
}

show_status() {
  local ref linked_ref=''
  ref="$(project_ref)"
  printf 'Passo Sicuro · toolbox Supabase\n\n'
  if [[ -n "$ref" ]]; then printf 'Progetto configurato: %s\n' "$ref"; else printf '%s\n' 'Progetto configurato: manca VITE_SUPABASE_URL'; fi
  if [[ -n "$(command_path)" ]]; then printf 'Supabase CLI: %s\n' 'disponibile'; else printf '%s\n' 'Supabase CLI: non trovata'; fi
  if [[ -s "$REPO_ROOT/supabase/.temp/project-ref" ]]; then linked_ref="$(tr -d '[:space:]' < "$REPO_ROOT/supabase/.temp/project-ref")"; fi
  if [[ -n "$linked_ref" ]]; then printf 'Progetto collegato: %s\n' "$linked_ref"; else printf '%s\n' 'Progetto collegato: no'; fi
  printf 'Migration locali: '
  find "$REPO_ROOT/supabase/migrations" -maxdepth 1 -type f -name '*.sql' 2>/dev/null | wc -l | tr -d ' '
}

usage() {
  cat <<'HELP'
Uso: npm run supabase:toolbox -- [comando] [opzioni]

Comandi:
  status                 Mostra progetto, collegamento CLI e migration locali
  login                  Autentica la Supabase CLI
  link                   Collega questa cartella al progetto indicato in .env.local
  migrations             Elenca le migration locali
  push [--yes|--dry-run]  Applica le migration al progetto remoto
  new NOME               Crea una nuova migration SQL
  help                   Mostra questo aiuto

Variabili lette da .env.local: VITE_SUPABASE_URL, SUPABASE_PROJECT_REF,
SUPABASE_ACCESS_TOKEN. Il token non viene mai mostrato.
HELP
}

run_push() {
  local ref result=0
  ref="$(require_project_ref)"
  confirm "Applicherò le migration pendenti al progetto remoto $ref con supabase db push." || result=$?
  [[ "$result" == 2 ]] && return 0
  [[ "$result" == 0 ]] || { printf '%s\n' 'Operazione annullata.'; return 0; }
  ensure_linked
  (cd "$REPO_ROOT" && "$SUPABASE_CLI" db push)
}

run_new() {
  local name="${1:-}" result=0
  [[ "$name" =~ ^[a-z][a-z0-9]*(_[a-z0-9]+)*$ ]] || die 'Nome non valido: usa snake_case, per esempio add_crossing_indexes.'
  confirm "Creerò supabase/migrations/<timestamp>_$name.sql." || result=$?
  [[ "$result" == 2 ]] && return 0
  [[ "$result" == 0 ]] || { printf '%s\n' 'Operazione annullata.'; return 0; }
  require_cli
  (cd "$REPO_ROOT" && "$SUPABASE_CLI" migration new "$name")
}

interactive_menu() {
  local choice
  while true; do
    printf '\nPasso Sicuro · Supabase toolbox\n'
    printf '  1) Stato progetto\n  2) Login CLI\n  3) Collega progetto\n  4) Elenca migration\n  5) Applica migration al remoto\n  6) Crea migration\n  0) Esci\n'
    read -r -p 'Scelta: ' choice || return 0
    case "$choice" in
      1) show_status ;;
      2) require_cli; "$SUPABASE_CLI" login ;;
      3) ensure_linked ;;
      4) find "$REPO_ROOT/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -print | sort ;;
      5) run_push ;;
      6) read -r -p 'Nome migration snake_case: ' choice; run_new "$choice" ;;
      0) return 0 ;;
      *) printf '%s\n' 'Scelta non valida.' ;;
    esac
  done
}

if [[ "${1:-}" == --dry-run ]]; then DRY_RUN=1; shift; fi
if [[ "${1:-}" == --yes ]]; then YES=1; shift; fi
case "${1:-}" in
  '') interactive_menu ;;
  status) show_status ;;
  login) require_cli; "$SUPABASE_CLI" login ;;
  link) ensure_linked ;;
  migrations) find "$REPO_ROOT/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -print | sort ;;
  push) shift; [[ "${1:-}" == --dry-run ]] && DRY_RUN=1; [[ "${1:-}" == --yes ]] && YES=1; run_push ;;
  new) shift; run_new "${1:-}" ;;
  -h|--help|help) usage ;;
  *) usage >&2; exit 2 ;;
esac
