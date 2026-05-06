variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "environment" { type = string }
variable "subnet_id" { type = string }

variable "ssl_certificate_name" {
  description = "Name of the SSL certificate in Key Vault"
  type        = string
  default     = "careerlens-tls"
}

variable "ssl_certificate_data" {
  description = "Base64-encoded PFX certificate (set via TF_VAR or secrets)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "ssl_certificate_password" {
  description = "Password for the PFX certificate"
  type        = string
  default     = ""
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Public IP
# ---------------------------------------------------------------------------

resource "azurerm_public_ip" "appgw" {
  name                = "careerlens-${var.environment}-appgw-pip"
  location            = var.location
  resource_group_name = var.resource_group_name
  allocation_method   = "Static"
  sku                 = "Standard"

  tags = {
    Environment = var.environment
    Project     = "CareerLens"
    ManagedBy   = "Terraform"
  }
}

# ---------------------------------------------------------------------------
# Application Gateway v2
# ---------------------------------------------------------------------------

locals {
  gw_name                = "careerlens-${var.environment}-appgw"
  frontend_ip_name       = "appgw-frontend-ip"
  frontend_port_http     = "appgw-frontend-port-http"
  frontend_port_https    = "appgw-frontend-port-https"
  backend_pool_frontend  = "bp-frontend"
  backend_pool_backend   = "bp-backend"
  backend_pool_simulator = "bp-interview-simulator"
  http_setting_frontend  = "hs-frontend"
  http_setting_backend   = "hs-backend"
  http_setting_simulator = "hs-simulator"
  probe_frontend         = "probe-frontend"
  probe_backend          = "probe-backend"
  probe_simulator        = "probe-simulator"
  listener_http          = "listener-http"
  listener_https         = "listener-https"
  redirect_config        = "http-to-https"
  url_path_map           = "careerlens-url-path-map"
  rule_https             = "rule-https"
  rule_http_redirect     = "rule-http-redirect"
}

resource "azurerm_application_gateway" "main" {
  name                = local.gw_name
  location            = var.location
  resource_group_name = var.resource_group_name

  tags = {
    Environment = var.environment
    Project     = "CareerLens"
    ManagedBy   = "Terraform"
  }

  sku {
    name     = "Standard_v2"
    tier     = "Standard_v2"
    capacity = var.environment == "prod" ? 3 : 1
  }

  gateway_ip_configuration {
    name      = "appgw-ip-config"
    subnet_id = var.subnet_id
  }

  # ---- Frontend ----

  frontend_ip_configuration {
    name                 = local.frontend_ip_name
    public_ip_address_id = azurerm_public_ip.appgw.id
  }

  frontend_port {
    name = local.frontend_port_http
    port = 80
  }

  frontend_port {
    name = local.frontend_port_https
    port = 443
  }

  # ---- SSL Certificate ----

  dynamic "ssl_certificate" {
    for_each = var.ssl_certificate_data != "" ? [1] : []
    content {
      name     = var.ssl_certificate_name
      data     = var.ssl_certificate_data
      password = var.ssl_certificate_password
    }
  }

  # ---- Backend Pools ----

  backend_address_pool {
    name = local.backend_pool_frontend
  }

  backend_address_pool {
    name = local.backend_pool_backend
  }

  backend_address_pool {
    name = local.backend_pool_simulator
  }

  # ---- Backend HTTP Settings ----

  backend_http_settings {
    name                  = local.http_setting_frontend
    cookie_based_affinity = "Disabled"
    port                  = 3000
    protocol              = "Http"
    request_timeout       = 30
    probe_name            = local.probe_frontend
  }

  backend_http_settings {
    name                  = local.http_setting_backend
    cookie_based_affinity = "Disabled"
    port                  = 8000
    protocol              = "Http"
    request_timeout       = 60
    probe_name            = local.probe_backend
  }

  backend_http_settings {
    name                  = local.http_setting_simulator
    cookie_based_affinity = "Disabled"
    port                  = 8000
    protocol              = "Http"
    request_timeout       = 120
    probe_name            = local.probe_simulator
  }

  # ---- Health Probes ----

  probe {
    name                = local.probe_frontend
    protocol            = "Http"
    path                = "/"
    host                = "127.0.0.1"
    interval            = 30
    timeout             = 10
    unhealthy_threshold = 3
  }

  probe {
    name                = local.probe_backend
    protocol            = "Http"
    path                = "/api/health"
    host                = "127.0.0.1"
    interval            = 30
    timeout             = 10
    unhealthy_threshold = 3
  }

  probe {
    name                = local.probe_simulator
    protocol            = "Http"
    path                = "/health"
    host                = "127.0.0.1"
    interval            = 30
    timeout             = 15
    unhealthy_threshold = 3
  }

  # ---- HTTP Listener (redirect to HTTPS) ----

  http_listener {
    name                           = local.listener_http
    frontend_ip_configuration_name = local.frontend_ip_name
    frontend_port_name             = local.frontend_port_http
    protocol                       = "Http"
  }

  # ---- HTTPS Listener ----

  http_listener {
    name                           = local.listener_https
    frontend_ip_configuration_name = local.frontend_ip_name
    frontend_port_name             = local.frontend_port_https
    protocol                       = var.ssl_certificate_data != "" ? "Https" : "Http"
    ssl_certificate_name           = var.ssl_certificate_data != "" ? var.ssl_certificate_name : null
  }

  # ---- Redirect HTTP -> HTTPS ----

  redirect_configuration {
    name                 = local.redirect_config
    redirect_type        = "Permanent"
    target_listener_name = local.listener_https
    include_path         = true
    include_query_string = true
  }

  # ---- URL Path Map (path-based routing) ----

  url_path_map {
    name                               = local.url_path_map
    default_backend_address_pool_name  = local.backend_pool_frontend
    default_backend_http_settings_name = local.http_setting_frontend

    # /api/sim/* -> interview-simulator backend pool
    path_rule {
      name                       = "simulator-api"
      paths                      = ["/api/sim/*"]
      backend_address_pool_name  = local.backend_pool_simulator
      backend_http_settings_name = local.http_setting_simulator
    }

    # /api/* -> backend pool
    path_rule {
      name                       = "backend-api"
      paths                      = ["/api/*"]
      backend_address_pool_name  = local.backend_pool_backend
      backend_http_settings_name = local.http_setting_backend
    }
  }

  # ---- Routing Rules ----

  request_routing_rule {
    name                        = local.rule_https
    priority                    = 100
    rule_type                   = "PathBasedRouting"
    http_listener_name          = local.listener_https
    url_path_map_name           = local.url_path_map
  }

  request_routing_rule {
    name                        = local.rule_http_redirect
    priority                    = 200
    rule_type                   = "Basic"
    http_listener_name          = local.listener_http
    redirect_configuration_name = local.redirect_config
  }
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "public_ip" {
  value = azurerm_public_ip.appgw.ip_address
}

output "gateway_id" {
  value = azurerm_application_gateway.main.id
}
