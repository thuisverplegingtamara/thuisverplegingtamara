# GitHub Pages koppelen aan GoDaddy domein

## GitHub

Repository > Settings > Pages:

- Source: Deploy from branch
- Branch: main
- Folder: root
- Custom domain: `www.thuisverplegingtamara.be`
- Enforce HTTPS aanvinken zodra beschikbaar

## GoDaddy DNS

### Voor www

```text
Type: CNAME
Name: www
Value: <jouw-github-gebruikersnaam>.github.io
TTL: default
```

### Voor domein zonder www

Maak vier A-records:

```text
Type: A | Name: @ | Value: 185.199.108.153
Type: A | Name: @ | Value: 185.199.109.153
Type: A | Name: @ | Value: 185.199.110.153
Type: A | Name: @ | Value: 185.199.111.153
```

DNS kan tot 24 uur nodig hebben.
