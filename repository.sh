#!/bin/bash

# Repository operations for graphql-isoclient. The CI workflows source this file and call its functions.
# Every operation is self contained, there are no external library dependencies.

set -e

run_integrity_checks() {
  local target_directory_path=""
  local output_file_path=""
  local project_item_list=""

  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")
  output_file_path=$(common_extract_flag_value output_file --default="" "$@")
  project_item_list="CHANGELOG.md,LICENSE,README.md,oxfmt.config.ts,oxlint.config.ts,package.json,rolldown.config.ts,tsconfig.json,repository.sh,src/,tests/"

  common_check_variables target_directory_path project_item_list
  common_check_directory_exists --directory_path="$target_directory_path"

  common_print_message --message="Running the integrity checks in $target_directory_path" --color=blue

  check_project_structure --target_directory="$target_directory_path" --items="$project_item_list"
  check_changelog_version --target_directory="$target_directory_path"
  run_scripts --target_directory="$target_directory_path" --scripts="lint"
  run_scripts --target_directory="$target_directory_path" --scripts="format -- --check"

  if [ -n "$output_file_path" ]; then
    record_should_publish --target_directory="$target_directory_path" --output_file="$output_file_path"
  fi

  common_print_message --message="Integrity checks complete in $target_directory_path" --color=green
}

check_project_structure() {
  local target_directory_path=""
  local project_item_list=""
  local project_item_path=""

  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")
  project_item_list=$(common_extract_flag_value items "$@")

  common_check_variables target_directory_path project_item_list
  common_check_directory_exists --directory_path="$target_directory_path"

  local item_list_with_commas="${project_item_list//,/ }"

  for project_item_path in $item_list_with_commas; do
    if [ -e "$target_directory_path/$project_item_path" ]; then
      continue
    fi

    common_print_message --message="Error: $target_directory_path is missing $project_item_path" --color=red

    exit 1
  done

  common_print_message --message="Project structure is complete in $target_directory_path" --color=green
}

check_changelog_version() {
  local target_directory_path=""
  local package_version=""

  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")

  common_check_variables target_directory_path
  common_check_directory_exists --directory_path="$target_directory_path"
  common_check_file_exists --file_path="$target_directory_path/package.json"
  common_check_file_exists --file_path="$target_directory_path/CHANGELOG.md"

  package_version=$(get_package_version --target_directory="$target_directory_path")
  common_check_variables package_version

  if ! grep -qF "## [$package_version]" "$target_directory_path/CHANGELOG.md"; then
    common_print_message --message="Error: $target_directory_path CHANGELOG.md is missing an entry for $package_version" --color=red

    exit 1
  fi

  common_print_message --message="$target_directory_path CHANGELOG.md contains $package_version" --color=green
}

check_should_publish() {
  local target_directory_path=""
  local package_name=""
  local local_version=""
  local published_version=""

  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")

  common_check_variables target_directory_path
  common_check_directory_exists --directory_path="$target_directory_path"
  common_check_file_exists --file_path="$target_directory_path/package.json"

  package_name=$(read_package_json_field --target_directory="$target_directory_path" --field="name")
  local_version=$(read_package_json_field --target_directory="$target_directory_path" --field="version")
  common_check_variables package_name local_version

  published_version=$(npm view "$package_name" version 2>/dev/null || true)

  if [ -z "$published_version" ]; then
    published_version="0.0.0"
  fi

  if [ "$published_version" = "$local_version" ]; then
    common_print_message --message="Version $local_version of $package_name is already published" --color=yellow
    printf 'false\n'

    return 0
  fi

  if [ "$(printf '%s\n%s\n' "$published_version" "$local_version" | sort -V | head -n 1)" = "$published_version" ]; then
    common_print_message --message="Version $local_version of $package_name is newer than $published_version" --color=green
    printf 'true\n'

    return 0
  fi

  common_print_message --message="Version $local_version of $package_name is not newer than $published_version" --color=yellow
  printf 'false\n'
}

record_should_publish() {
  local target_directory_path=""
  local output_file_path=""
  local publish_decision=""

  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")
  output_file_path=$(common_extract_flag_value output_file "$@")

  common_check_variables target_directory_path output_file_path
  common_check_directory_exists --directory_path="$(dirname -- "$output_file_path")"

  if ! publish_decision=$(check_should_publish --target_directory="$target_directory_path"); then
    common_print_message --message="Error: the publish decision failed for $target_directory_path" --color=red

    exit 1
  fi

  case "$publish_decision" in
    true|false) ;;
    *)
      common_print_message --message="Error: unexpected publish decision $publish_decision" --color=red

      exit 1
      ;;
  esac

  printf 'should_publish=%s\n' "$publish_decision" >> "$output_file_path"
  common_print_message --message="should_publish=$publish_decision" --color=green
}

check_package_install() {
  local target_directory_path=""
  local package_version=""
  local temporary_directory_path=""
  local tarball_path=""

  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")

  common_check_variables target_directory_path
  common_check_directory_exists --directory_path="$target_directory_path"
  common_check_command_exists --command="npm"

  package_version=$(get_package_version --target_directory="$target_directory_path")
  common_check_variables package_version

  temporary_directory_path=$(mktemp -d)
  tarball_path="$temporary_directory_path/graphql-isoclient-${package_version}.tgz"

  common_print_message --message="Packing the package into $tarball_path" --color=blue

  if ! npm pack --pack-destination "$temporary_directory_path" > /dev/null; then
    common_print_message --message="Error: npm pack failed" --color=red
    rm -rf "$temporary_directory_path"

    exit 1
  fi

  mkdir -p "$temporary_directory_path/project"

  printf '%s\n' "{" "  \"name\": \"package-smoke-test\"," "  \"private\": true," "  \"version\": \"0.0.0\"" "}" > "$temporary_directory_path/project/package.json"

  if ! npm install --prefix "$temporary_directory_path/project" "$tarball_path" --no-audit --no-fund --offline > /dev/null; then
    common_print_message --message="Error: the packed package could not be installed" --color=red
    rm -rf "$temporary_directory_path"

    exit 1
  fi

  if ! "$temporary_directory_path/project/node_modules/.bin/graphql-isoclient" help > /dev/null; then
    common_print_message --message="Error: the packed package did not run its binary" --color=red
    rm -rf "$temporary_directory_path"

    exit 1
  fi

  rm -rf "$temporary_directory_path"

  common_print_message --message="Packed package installs and runs" --color=green
}

run_tests() {
  local target_directory_path=""
  local relative_test_file_path=""

  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")
  relative_test_file_path=$(common_extract_flag_value filter --default="tests/index.test.ts" "$@")

  common_check_variables target_directory_path relative_test_file_path
  common_check_directory_exists --directory_path="$target_directory_path"
  common_check_file_exists --file_path="$target_directory_path/$relative_test_file_path"

  common_print_message --message="Running the tests in $target_directory_path" --color=blue

  if ! (cd "$target_directory_path" && npm test); then
    common_print_message --message="Error: the tests failed in $target_directory_path" --color=red

    exit 1
  fi

  common_print_message --message="Tests complete in $target_directory_path" --color=green
}

install_package_dependencies() {
  local target_directory_path=""

  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")

  common_check_variables target_directory_path
  common_check_directory_exists --directory_path="$target_directory_path"
  common_check_file_exists --file_path="$target_directory_path/package.json"
  common_check_file_exists --file_path="$target_directory_path/package-lock.json"

  common_print_message --message="Installing the dependencies in $target_directory_path" --color=blue

  if ! (cd "$target_directory_path" && npm ci); then
    common_print_message --message="Error: the dependency installation failed in $target_directory_path" --color=red

    exit 1
  fi

  common_print_message --message="Dependencies installed in $target_directory_path" --color=green
}

run_scripts() {
  local target_directory_path=""
  local script_name_list=""

  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")
  script_name_list=$(common_extract_flag_value scripts "$@")

  common_check_variables target_directory_path script_name_list
  common_check_directory_exists --directory_path="$target_directory_path"

  common_print_message --message="Running npm run $script_name_list in $target_directory_path" --color=blue

  if ! (cd "$target_directory_path" && npm run $script_name_list); then
    common_print_message --message="Error: npm run $script_name_list failed in $target_directory_path" --color=red

    exit 1
  fi

  common_print_message --message="npm run $script_name_list complete in $target_directory_path" --color=green
}

publish_new_version() {
  local target_directory_path=""
  local target_registry=""
  local current_version=""
  local package_name=""
  local manifest_version=""
  local published_version=""

  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")
  target_registry=$(common_extract_flag_value registry --default="npm" "$@")
  current_version=$(common_extract_flag_value current_version "$@")

  common_check_variables target_directory_path target_registry current_version
  common_check_directory_exists --directory_path="$target_directory_path"
  common_check_command_exists --command="npm"

  package_name=$(read_package_json_field --target_directory="$target_directory_path" --field="name")
  manifest_version=$(get_package_version --target_directory="$target_directory_path")
  common_check_variables package_name manifest_version

  if [ "$current_version" != "$manifest_version" ]; then
    common_print_message --message="Error: the exported version $current_version does not match the manifest version $manifest_version" --color=red

    exit 1
  fi

  published_version=$(npm view "$package_name" version 2>/dev/null || true)

  if [ -z "$published_version" ]; then
    published_version="0.0.0"
  fi

  if [ "$published_version" = "$current_version" ]; then
    common_print_message --message="Version $current_version is already published, nothing to publish" --color=yellow

    return 0
  fi

  if [ "$(printf '%s\n%s\n' "$published_version" "$current_version" | sort -V | head -n 1)" != "$published_version" ]; then
    common_print_message --message="Error: version $current_version is not newer than the published $published_version" --color=red

    exit 1
  fi

  publish_package --target_directory="$target_directory_path" --registry="$target_registry"
}

publish_package() {
  local target_directory_path=""
  local target_registry=""
  local package_version=""
  local published_version=""

  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")
  target_registry=$(common_extract_flag_value registry --default="npm" "$@")

  common_check_variables target_directory_path target_registry
  common_check_directory_exists --directory_path="$target_directory_path"
  common_check_command_exists --command="npm"

  case "$target_registry" in
    npm|github) ;;
    *)
      common_print_message --message="Error: --registry must be npm or github, got $target_registry" --color=red

      exit 1
      ;;
  esac

  package_version=$(get_package_version --target_directory="$target_directory_path")
  published_version=$(npm view "$(read_package_json_field --target_directory="$target_directory_path" --field="name")" version 2>/dev/null || true)

  if [ -n "$published_version" ] && [ "$published_version" = "$package_version" ]; then
    common_print_message --message="Version $package_version is already published" --color=yellow

    return 0
  fi

  common_print_message --message="Publishing $package_version to $target_registry" --color=blue

  if [ "$target_registry" = "github" ]; then
    if ! (cd "$target_directory_path" && npm publish --registry "https://npm.pkg.github.com"); then
      common_print_message --message="Error: the publish to $target_registry failed" --color=red

      exit 1
    fi
  else
    if ! (cd "$target_directory_path" && npm publish); then
      common_print_message --message="Error: the publish to $target_registry failed" --color=red

      exit 1
    fi
  fi

  common_print_message --message="Published $package_version to $target_registry" --color=green
}

git_push() {
  local commit_message=""
  local target_directory_path=""
  local allowed_message_pattern='^(development|maintenance): .+'

  commit_message=$(common_extract_flag_value message "$@")
  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")

  common_check_variables commit_message target_directory_path

  if [[ ! $commit_message =~ $allowed_message_pattern ]]; then
    common_print_message --message="Error: --message must be development: <description> or maintenance: <description>" --color=red

    exit 1
  fi

  common_check_directory_exists --directory_path="$target_directory_path"

  common_print_message --message="Committing and pushing in $target_directory_path" --color=blue

  if ! (cd "$target_directory_path" && git add --all); then
    common_print_message --message="Error: git add failed" --color=red

    exit 1
  fi

  if ! (cd "$target_directory_path" && git diff --cached --quiet); then
    if ! (cd "$target_directory_path" && git commit --message "$commit_message"); then
      common_print_message --message="Error: git commit failed" --color=red

      exit 1
    fi
  fi

  if ! (cd "$target_directory_path" && git push); then
    common_print_message --message="Error: git push failed" --color=red

    exit 1
  fi

  common_print_message --message="Pushed to the remote in $target_directory_path" --color=green
}

get_package_version() {
  local target_directory_path=""

  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")

  common_check_variables target_directory_path
  common_check_directory_exists --directory_path="$target_directory_path"
  common_check_file_exists --file_path="$target_directory_path/package.json"

  read_package_json_field --target_directory="$target_directory_path" --field="version"
}

read_package_json_field() {
  local target_directory_path=""
  local field_name=""
  local field_value=""

  target_directory_path=$(common_extract_flag_value target_directory --default="." "$@")
  field_name=$(common_extract_flag_value field "$@")

  common_check_variables target_directory_path field_name
  common_check_file_exists --file_path="$target_directory_path/package.json"

  field_value=$(node -p "require('$target_directory_path/package.json').$field_name ?? ''")

  printf '%s' "$field_value"
}

common_print_message() {
  local message_text=""
  local message_color=""

  message_text=$(common_extract_flag_value message "$@")
  message_color=$(common_extract_flag_value color --default="none" "$@")

  common_check_variables message_text

  local color_code=""
  local reset_code=$'\033[0m'

  case "$message_color" in
    blue)
      color_code=$'\033[0;34m'
      ;;
    green)
      color_code=$'\033[0;32m'
      ;;
    red)
      color_code=$'\033[0;31m'
      ;;
    yellow)
      color_code=$'\033[0;33m'
      ;;
  esac

  printf '%s%s%s\n' "$color_code" "$message_text" "$reset_code" >&2
}

common_extract_flag_value() {
  local flag_name="$1"

  shift

  local flag_prefix="--${flag_name}="
  local default_prefix="--default="
  local argument_text=""
  local found_value=""
  local has_found_value="false"
  local default_value=""
  local has_default_value="false"

  for argument_text in "$@"; do
    case "$argument_text" in
      "$flag_prefix"*)
        found_value="${argument_text#"$flag_prefix"}"
        has_found_value="true"
        ;;
      "$default_prefix"*)
        default_value="${argument_text#"$default_prefix"}"
        has_default_value="true"
        ;;
    esac
  done

  if [ "$has_found_value" = "true" ]; then
    if [ -z "$found_value" ]; then
      common_print_message --message="Flag --${flag_name} must not be empty" --color=red

      exit 1
    fi

    printf '%s' "$found_value"

    return 0
  fi

  if [ "$has_default_value" = "true" ]; then
    printf '%s' "$default_value"

    return 0
  fi

  common_print_message --message="Missing required flag --${flag_name}" --color=red

  exit 1
}

common_check_variables() {
  local variable_name=""

  for variable_name in "$@"; do
    if [ -z "${!variable_name}" ]; then
      common_print_message --message="Variable ${variable_name} is empty" --color=red

      exit 1
    fi
  done
}

common_check_file_exists() {
  local file_path=""

  file_path=$(common_extract_flag_value file_path "$@")

  common_check_variables file_path

  if [ ! -f "$file_path" ]; then
    common_print_message --message="Error: the file $file_path does not exist" --color=red

    exit 1
  fi
}

common_check_directory_exists() {
  local directory_path=""

  directory_path=$(common_extract_flag_value directory_path "$@")

  common_check_variables directory_path

  if [ ! -d "$directory_path" ]; then
    common_print_message --message="Error: the directory $directory_path does not exist" --color=red

    exit 1
  fi
}

common_check_command_exists() {
  local command_name=""

  command_name=$(common_extract_flag_value command "$@")

  common_check_variables command_name

  if ! command -v "$command_name" > /dev/null 2>&1; then
    common_print_message --message="Error: the command $command_name is not available" --color=red

    exit 1
  fi
}
