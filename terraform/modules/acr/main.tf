variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "environment" { type = string }

resource "azurerm_container_registry" "main" {
  name                = "careerlens${var.environment}acr"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "Basic"
  admin_enabled       = true
}

output "acr_id" { value = azurerm_container_registry.main.id }
output "acr_login_server" { value = azurerm_container_registry.main.login_server }
