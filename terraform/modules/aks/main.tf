variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "environment" { type = string }
variable "subnet_id" { type = string }
variable "acr_id" { type = string }

resource "azurerm_kubernetes_cluster" "main" {
  name                = "careerlens-${var.environment}-aks"
  location            = var.location
  resource_group_name = var.resource_group_name
  dns_prefix          = "careerlens-${var.environment}"

  default_node_pool {
    name           = "default"
    node_count     = 2
    vm_size        = "Standard_D4s_v3"
    vnet_subnet_id = var.subnet_id
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin = "azure"
    service_cidr   = "10.1.0.0/16"
    dns_service_ip = "10.1.0.10"
  }
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = var.acr_id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_kubernetes_cluster.main.kubelet_identity[0].object_id
}

output "cluster_name" { value = azurerm_kubernetes_cluster.main.name }
output "cluster_id" { value = azurerm_kubernetes_cluster.main.id }
output "kube_config" {
  value     = azurerm_kubernetes_cluster.main.kube_config_raw
  sensitive = true
}
