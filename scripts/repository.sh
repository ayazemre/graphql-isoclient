#!/bin/bash

# Repository operations for graphql-isoclient. The CI workflows source this file and call its functions.

publish_package() {
  local current_version="" package_type=""

  current_version=$(extract_flag_value current_version "" "$@")
  package_type=$(extract_flag_value package_type "" "$@")

  check_variables current_version package_type

  local package_version=""
  package_version=$(get_package_version)

  if [ "$current_version" != "$package_version" ]; then
    print_message --message="Version $current_version does not match package version $package_version" --message_color=red

    return 1
  fi

  if [ "$package_type" = "external" ]; then
    npm publish

    return $?
  fi

  if [ "$package_type" = "internal" ]; then
    npm publish --registry "https://npm.pkg.github.com"

    return $?
  fi

  print_message --message="Unknown package type $package_type" --message_color=red

  return 1
}

check_changelog_version() {
  local package_version="" changelog_version=""

  package_version=$(get_package_version)
  changelog_version=$(get_changelog_version)

  check_variables package_version changelog_version

  if [ "$package_version" != "$changelog_version" ]; then
    print_message --message="CHANGELOG version $changelog_version does not match package version $package_version" --message_color=red

    return 1
  fi

  print_message --message="CHANGELOG version $changelog_version matches package version $package_version" --message_color=green

  return 0
}

print_message() {
  local message_text="" message_color=""

  message_text=$(extract_flag_value message "" "$@")
  message_color=$(extract_flag_value message_color "none" "$@")

  check_variables message_text

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

extract_flag_value() {
  local flag_name="$1"
  local default_value="$2"

  shift 2

  local flag_prefix="--${flag_name}="
  local argument_text=""
  local found_value=""
  local has_found_value="false"

  for argument_text in "$@"; do
    case "$argument_text" in
      "$flag_prefix"*)
        found_value="${argument_text#"$flag_prefix"}"
        has_found_value="true"
        ;;
    esac
  done

  if [ "$has_found_value" = "true" ]; then
    if [ -z "$found_value" ]; then
      print_message --message="Flag --${flag_name} must not be empty" --message_color=red

      exit 1
    fi

    printf '%s' "$found_value"

    return 0
  fi

  if [ -n "$default_value" ]; then
    printf '%s' "$default_value"

    return 0
  fi

  print_message --message="Missing required flag --${flag_name}" --message_color=red

  exit 1
}

check_variables() {
  local variable_name=""

  for variable_name in "$@"; do
    if [ -z "${!variable_name}" ]; then
      print_message --message="Variable ${variable_name} is empty" --message_color=red

      exit 1
    fi
  done
}

get_changelog_version() {
  sed -n 's/^## \[\([0-9][0-9.]*\)\].*/\1/p' CHANGELOG.md | head -n 1
}

get_package_version() {
  node -p "require('./package.json').version"
}

run_npm_format_check() {
  npm run format -- --check
}

run_npm_lint() {
  npm run lint
}

run_npm_tests() {
  npm test
}
