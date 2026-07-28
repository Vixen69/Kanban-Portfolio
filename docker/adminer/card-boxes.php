<?php
// Éditeur par champs pour la DÉMO (profil compose `tools`, jamais livré) :
// dans Adminer, la colonne `data` (jsonb) des tables `cards` et `card_events`
// est éclatée en boîtes typées (texte, nombre, case, select, listes une
// entrée par ligne, mini-JSON pour les structures imbriquées) au lieu de la
// zone JSON brute. Un repli « JSON brut » reste disponible (ajout de clés,
// éditions exotiques) et GAGNE quand sa case est cochée.
// Intégrité : le JSON est réassemblé à partir du document original (clés
// inconnues préservées, types respectés, décodage en stdClass pour que
// `{}` reste un objet) ; une valeur illisible garde la valeur d'origine.
// Limite connue : les listes sont scindées par ligne — une entrée contenant
// un retour à la ligne serait coupée (jamais le cas pour tags/ids).

class AdminerCardBoxes {
	// Kind par clé. Absente => mini-JSON générique (rien n'est inéditable).
	private $schemas = array(
		"cards" => array(
			"id" => "locked",
			"title" => "str", "owner" => "str", "domain" => "str",
			"laneId" => "str", "columnId" => "str",
			"notes" => "text", "contentionNote" => "text",
			"typeId" => "str0", "codename" => "str0", "blockedReason" => "str0",
			"loadPlan" => "str0", "sciformaId" => "str0",
			"effortEstimated" => "num0", "effortConsumed" => "num0",
			"budgetEstimated" => "num0", "budgetConsumed" => "num0",
			"budgetRdli" => "num0", "budgetEngaged" => "num0",
			"blocked" => "bool",
			"criticality" => "enum:top,major,normal",
			"nature" => "enum:simple,complicated,complex",
			"source" => "enum:fixtures,csv,sciforma,manual",
			"createdAt" => "iso", "blockedSince" => "iso0", "dateRdr" => "iso0",
			"tags" => "list", "dependencies" => "list", "resources" => "list",
			"contentionProfiles" => "list", "projectConstraints" => "list",
			"alerts" => "list",
		),
		"card_events" => array(
			"id" => "locked",
			"actor" => "str", "cardId" => "str",
			"ts" => "iso",
			"type" => "enum:created,moved,blocked,unblocked,edited,commented,archived,unarchived,deleted,imported",
			"fromColumn" => "str0", "toColumn" => "str0",
		),
	);

	private function kind($table, $key) {
		$schema = $this->schemas[$table];
		return isset($schema[$key]) ? $schema[$key] : "json";
	}

	// Une boîte : label + input typé, nommé cardbox[<clé>].
	private function box($table, $key, $value) {
		$kind = $this->kind($table, $key);
		$name = "cardbox[" . h($key) . "]";
		$full = false;
		if ($kind === "locked") {
			$input = "<input type='text' value='" . h((string) $value) . "' disabled>";
		} elseif ($kind === "bool") {
			$checked = $value ? " checked" : "";
			$input = "<input type='hidden' name='$name' value='0'>"
				. "<label class='cardbox-check'><input type='checkbox' name='$name' value='1'$checked> vrai</label>";
		} elseif (strpos($kind, "enum:") === 0) {
			$options = explode(",", substr($kind, 5));
			if ($value !== null && !in_array($value, $options, true)) {
				$options[] = (string) $value; // valeur hors liste : conservable
			}
			$input = "<select name='$name'>";
			foreach ($options as $option) {
				$selected = ($value === $option ? " selected" : "");
				$input .= "<option value='" . h($option) . "'$selected>" . h($option) . "</option>";
			}
			$input .= "</select>";
		} elseif ($kind === "num0") {
			$text = ($value === null ? "" : (string) $value);
			$input = "<input type='text' name='$name' value='" . h($text) . "' placeholder='null' inputmode='decimal'>";
		} elseif ($kind === "iso" || $kind === "iso0") {
			$text = ($value === null ? "" : (string) $value);
			$hint = ($kind === "iso0" ? "vide = null · " : "") . "format ISO, ex. 2026-07-10T09:00:00.000Z";
			$input = "<input type='text' name='$name' value='" . h($text) . "' title='" . h($hint) . "' placeholder='2026-07-10T09:00:00.000Z'>";
		} elseif ($kind === "list") {
			$lines = is_array($value) ? implode("\n", $value) : "";
			$rows = max(2, is_array($value) ? count($value) : 0);
			$input = "<textarea name='$name' rows='$rows' title='une entrée par ligne'>" . h($lines) . "</textarea>";
			$full = true;
		} elseif ($kind === "text") {
			$input = "<textarea name='$name' rows='2'>" . h($value === null ? "" : (string) $value) . "</textarea>";
			$full = true;
		} elseif ($kind === "json") {
			$json = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
			$rows = min(10, max(2, substr_count($json, "\n") + 1));
			$input = "<textarea name='$name' rows='$rows' class='cardbox-json' title='JSON — invalide = valeur conservée'>" . h($json) . "</textarea>";
			$full = true;
		} else { // str, str0
			$text = ($value === null ? "" : (string) $value);
			$placeholder = ($kind === "str0" ? " placeholder='null'" : "");
			$input = "<input type='text' name='$name' value='" . h($text) . "'$placeholder>";
		}
		$class = "cardbox" . ($full ? " cardbox-full" : "");
		return "<div class='$class'><b>" . h($key) . "</b>$input</div>";
	}

	/** Remplace la zone JSON brute par la grille de boîtes (édition mono-ligne). */
	function editInput($table, $field, $attrs, $value) {
		if (!isset($this->schemas[$table]) || $field["field"] !== "data" || isset($_GET["select"])) {
			return null; // autres tables/colonnes, édition groupée : défaut Adminer
		}
		$doc = json_decode((string) $value); // PAS assoc : {} doit rester un objet
		if (!($doc instanceof stdClass)) {
			return null; // INSERT (valeur vide) ou JSON corrompu : défaut Adminer
		}
		$html = "<input type='hidden' name='cardbox_on' value='1'>";
		$html .= "<div class='cardbox-grid'>";
		foreach (get_object_vars($doc) as $key => $item) {
			$html .= $this->box($table, $key, $item);
		}
		$html .= "</div>";
		$html .= "<details class='cardbox-raw'><summary>JSON brut (repli)</summary>"
			. "<label class='cardbox-check'><input type='checkbox' name='cardbox_raw' value='1'>"
			. " utiliser le JSON brut ci-dessous (ignore les boîtes — permet d'ajouter/retirer des clés)</label>"
			. "<textarea name='fields[data]' rows='10' class='cardbox-json'>"
			. h(json_encode($doc, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))
			. "</textarea></details>";
		return $html;
	}

	// Cast d'une valeur postée selon son kind ; $original en cas de doute.
	private function cast($kind, $posted, $original) {
		if ($kind === "bool") {
			return $posted === "1";
		}
		if ($kind === "num0") {
			$posted = trim($posted);
			if ($posted === "") return null;
			if (preg_match('~^-?\d+$~', $posted)) return (int) $posted;
			return is_numeric($posted) ? (float) $posted : $original;
		}
		if (strpos($kind, "enum:") === 0) {
			return in_array($posted, explode(",", substr($kind, 5)), true) ? $posted : $original;
		}
		if ($kind === "iso") {
			return trim($posted) === "" ? $original : $posted; // jamais null
		}
		if ($kind === "iso0" || $kind === "str0") {
			return $posted === "" ? null : $posted;
		}
		if ($kind === "list") {
			$lines = preg_split('~\R~u', $posted);
			return array_values(array_filter(array_map("trim", $lines), "strlen"));
		}
		if ($kind === "json") {
			$decoded = json_decode($posted);
			return (json_last_error() === JSON_ERROR_NONE) ? $decoded : $original;
		}
		return $posted; // str, text
	}

	/** Réassemble le JSON depuis les boîtes (ou prend le repli brut coché). */
	function processInput($field, $value, $function = "") {
		if ($field["field"] !== "data" || $function !== "" || !isset($_POST["cardbox_on"])) {
			return null; // fonction SQL, orig, INSERT, bulk : traitement par défaut
		}
		$raw = (string) $value; // = fields[data], le repli brut pré-rempli
		if (isset($_POST["cardbox_raw"])) {
			return q($raw); // JSON invalide => erreur franche du cast jsonb Postgres
		}
		$doc = json_decode($raw);
		if (!($doc instanceof stdClass)) {
			return q($raw); // base illisible : ne rien inventer
		}
		$table = isset($this->schemas[$_GET["edit"] ?? ""]) ? $_GET["edit"] : "cards";
		$posted = isset($_POST["cardbox"]) && is_array($_POST["cardbox"]) ? $_POST["cardbox"] : array();
		foreach (get_object_vars($doc) as $key => $original) {
			if (!array_key_exists($key, $posted)) {
				continue; // clé verrouillée ou non postée : intacte
			}
			$kind = $this->kind($table, $key);
			if ($kind === "locked") continue;
			$doc->$key = $this->cast($kind, (string) $posted[$key], $original);
		}
		return q(json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
	}

	/** Style de la grille, seulement sur les écrans d'édition concernés. */
	function head() {
		if (isset($_GET["edit"]) && isset($this->schemas[$_GET["edit"]])) {
			echo "<style>
.cardbox-grid { display: grid; grid-template-columns: repeat(2, minmax(280px, 1fr)); gap: 8px 16px; max-width: 940px; margin: 4px 0; }
.cardbox { display: flex; flex-direction: column; gap: 2px; }
.cardbox > b { font-size: 11px; color: #365; }
.cardbox input[type=text], .cardbox select, .cardbox textarea { width: 100%; box-sizing: border-box; }
.cardbox textarea { font: 12px/1.45 ui-monospace, monospace; }
.cardbox-full { grid-column: 1 / -1; }
.cardbox-check { font-size: 12px; }
.cardbox-raw { grid-column: 1 / -1; margin-top: 10px; max-width: 940px; }
.cardbox-raw textarea { width: 100%; box-sizing: border-box; font: 12px/1.45 ui-monospace, monospace; }
.cardbox-raw summary { cursor: pointer; color: #567; }
</style>";
		}
		return null;
	}
}

return new AdminerCardBoxes;
