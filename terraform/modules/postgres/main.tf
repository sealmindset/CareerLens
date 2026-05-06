variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "environment" { type = string }
variable "subnet_id" { type = string }

resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "careerlens-${var.environment}-pg"
  resource_group_name    = var.resource_group_name
  location               = var.location
  version                = "16"
  delegated_subnet_id    = var.subnet_id
  administrator_login    = "clensadmin"
  administrator_password = "ChangeMe1n-Pr0d!"
  sku_name               = "B_Standard_B1ms"
  storage_mb             = 32768
  zone                   = "1"
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = "career-lens"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

output "fqdn" { value = azurerm_postgresql_flexible_server.main.fqdn }
