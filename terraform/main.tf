terraform {
  required_version = ">= 1.5"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.80"
    }
  }

  backend "azurerm" {
    resource_group_name  = "careerlens-tfstate-rg"
    storage_account_name = "careerlenstfstate"
    container_name       = "tfstate"
    key                  = "careerlens.tfstate"
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "main" {
  name     = "careerlens-${var.environment}-rg"
  location = var.location

  tags = {
    Environment = var.environment
    Project     = "CareerLens"
    ManagedBy   = "Terraform"
  }
}

module "network" {
  source              = "./modules/network"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  environment         = var.environment
}

module "acr" {
  source              = "./modules/acr"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  environment         = var.environment
}

module "postgres" {
  source              = "./modules/postgres"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  environment         = var.environment
  subnet_id           = module.network.db_subnet_id
}

module "keyvault" {
  source              = "./modules/keyvault"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  environment         = var.environment
}

module "aks" {
  source              = "./modules/aks"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  environment         = var.environment
  subnet_id           = module.network.aks_subnet_id
  acr_id              = module.acr.acr_id
}

module "app_gateway" {
  source              = "./modules/app-gateway"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  environment         = var.environment
  subnet_id           = module.network.appgw_subnet_id
}

module "monitoring" {
  source              = "./modules/monitoring"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  environment         = var.environment
  aks_cluster_id      = module.aks.cluster_id
  log_retention_days  = var.log_retention_days
  alert_email         = var.alert_email
}
